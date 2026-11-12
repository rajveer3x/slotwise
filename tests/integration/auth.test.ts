import "dotenv/config";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { getDb } from "../../src/server/db";
import { hashPassword, verifyPassword } from "../../src/server/auth/password";
import { authenticateCredentials } from "../../src/server/auth/credentials";
import { changeAccountActive } from "../../src/server/services/accounts";
import { requireScope } from "../../src/server/auth/permissions";
import { Role } from "../../src/generated/prisma/enums";
const url = process.env.TEST_DATABASE_URL;
if (!url || new URL(url).pathname !== "/slotwise_auth_test") throw new Error("TEST_DATABASE_URL must identify slotwise_auth_test; never use your demo database.");
process.env.DATABASE_URL = url;
const db = getDb();
const prefix = `integration-${randomUUID()}`;
const departmentId = prefix, otherDepartmentId = `${prefix}-other`;
let passwordHash: string;
const actorId = `${prefix}-admin`, targetId = `${prefix}-faculty`, studentId = `${prefix}-student`;
const password = randomUUID();
before(async () => {
  passwordHash = await hashPassword(password);
  await db.department.createMany({ data: [{ id: departmentId, name: "Synthetic integration" }, { id: otherDepartmentId, name: "Other synthetic department" }] });
  for (const [id, role, dept] of [[actorId, Role.ADMIN, departmentId], [targetId, Role.FACULTY, departmentId], [studentId, Role.STUDENT, departmentId], [`${prefix}-foreign`, Role.FACULTY, otherDepartmentId]] as const) {
    await db.user.create({ data: { id, email: `${id}@slotwise.test`, name: id, role, departmentId: dept, passwordHash } });
  }
});
after(async () => { await db.user.deleteMany({ where: { departmentId: { in: [departmentId, otherDepartmentId] } } }); await db.department.deleteMany({ where: { id: { in: [departmentId, otherDepartmentId] } } }); await db.$disconnect(); });
test("Argon2id verifies real passwords and rejects mismatches and invalid hashes", async () => {
  assert.match(passwordHash, /^\$argon2id\$/);
  assert.equal(await verifyPassword(password, passwordHash), true);
  assert.equal(await verifyPassword("wrong", passwordHash), false);
  assert.equal(await verifyPassword(password), false);
  assert.equal(await verifyPassword(password, "malformed"), false);
});
test("credentials normalize email; unknown, inactive and incorrect credentials fail", async () => {
  assert.deepEqual(await authenticateCredentials({ email: ` ${targetId.toUpperCase()}@SLOTWISE.TEST `, password }), { id: targetId });
  assert.equal(await authenticateCredentials({ email: `${targetId}@slotwise.test`, password: "wrong" }), null);
  assert.equal(await authenticateCredentials({ email: `${prefix}-missing@slotwise.test`, password }), null);
  await db.user.update({ where: { id: targetId }, data: { active: false } });
  assert.equal(await authenticateCredentials({ email: `${targetId}@slotwise.test`, password }), null);
  await db.user.update({ where: { id: targetId }, data: { active: true } });
});
test("five failures consume the server window; correct sixth attempt is throttled", async () => {
  const email = `${studentId}@slotwise.test`;
  for (let i = 0; i < 5; i++) assert.equal(await authenticateCredentials({ email, password: "wrong" }), null);
  assert.equal(await authenticateCredentials({ email, password }), null);
});
test("student, anonymous, cross-department, missing target and self changes cannot mutate", async () => {
  for (const [actor, target] of [[studentId, targetId], [null, targetId], [actorId, `${prefix}-foreign`], [actorId, "missing"], [actorId, actorId]]) {
    await assert.rejects(changeAccountActive(actor, { userId: target, active: false, expectedActive: true }), /UNAUTHORIZED|FORBIDDEN/);
  }
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: targetId } })).active, true);
  for (const role of [Role.COORDINATOR, Role.HOD, Role.FACULTY, Role.STUDENT]) {
    assert.throws(() => requireScope({ active: true, role, departmentId }, [Role.ADMIN], departmentId), /FORBIDDEN/);
  }
  assert.throws(() => requireScope({ active: true, role: Role.HOD, departmentId }, [Role.HOD], otherDepartmentId), /FORBIDDEN/);
  assert.throws(() => requireScope({ active: true, role: Role.ADMIN, departmentId }, [Role.HOD], departmentId), /FORBIDDEN/);
});
test("revocation and changed role are reloaded despite stale caller identity", async () => {
  await db.user.update({ where: { id: actorId }, data: { role: Role.STUDENT } });
  await assert.rejects(changeAccountActive(actorId, { userId: targetId, active: false, expectedActive: true }), /FORBIDDEN/);
  await db.user.update({ where: { id: actorId }, data: { role: Role.ADMIN, active: false } });
  await assert.rejects(changeAccountActive(actorId, { userId: targetId, active: false, expectedActive: true }), /UNAUTHORIZED/);
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: targetId } })).active, true);
  await db.user.update({ where: { id: actorId }, data: { active: true } });
});
test("a concurrent revocation is observed after the actor row lock releases", async () => {
  let release!: () => void;
  let locked!: () => void;
  const lockReady = new Promise<void>(resolve => { locked = resolve; });
  const canCommit = new Promise<void>(resolve => { release = resolve; });
  const revoke = db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${actorId} FOR UPDATE`;
    await tx.user.update({ where: { id: actorId }, data: { active: false } });
    locked(); await canCommit;
  });
  await lockReady;
  const mutation = changeAccountActive(actorId, { userId: targetId, active: false, expectedActive: true });
  const rejected = assert.rejects(mutation, /UNAUTHORIZED/);
  release(); await revoke; await rejected;
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: targetId } })).active, true);
  await db.user.update({ where: { id: actorId }, data: { active: true } });
});
test("competing access mutations serialize; one commits and one reports stale data", async () => {
  const results = await Promise.all([1, 2].map(() => changeAccountActive(actorId, { userId: targetId, active: false, expectedActive: true })));
  assert.equal(results.filter(result => result.ok).length, 1);
  assert.equal(results.filter(result => !result.ok && result.code === "STALE_VERSION").length, 1);
  assert.equal((await db.user.findUniqueOrThrow({ where: { id: targetId } })).active, false);
});
test("database forbids nonnormalized and duplicate emails", async () => {
  const data = { email: `${actorId.toUpperCase()}@SLOTWISE.TEST`, name: "Bad email", role: Role.FACULTY, departmentId, passwordHash };
  await assert.rejects(db.user.create({ data }));
  await assert.rejects(db.user.create({ data: { ...data, email: `${actorId}@slotwise.test` } }));
});
