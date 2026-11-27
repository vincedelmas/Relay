import crypto from "node:crypto";
import {and, eq} from "drizzle-orm";
import {db} from "@/lib/server/database/db";
import {hashPassword} from "better-auth/crypto";
import {account, user} from "@/lib/server/database/schema";


const [, , rawEmail, rawPassword, rawName] = process.argv;


const password = rawPassword;
const email = rawEmail?.trim().toLowerCase();
const name = rawName?.trim() || email?.split("@")[0] || "Owner";


if (!email || !password) {
    console.error("Usage: bun run owner:setup <email> <password> [name]");
    process.exit(1);
}


if (password.length < 8) {
    console.error("Password must be at least 8 characters long.");
    process.exit(1);
}


const now = new Date();
const hashedPassword = await hashPassword(password);


const existingUser = db
    .select()
    .from(user)
    .where(eq(user.email, email))
    .get();


if (existingUser) {
    const existingAccount = db
        .select()
        .from(account)
        .where(and(eq(account.userId, existingUser.id), eq(account.providerId, "credential")))
        .get();

    if (existingAccount) {
        db.update(account)
            .set({ password: hashedPassword, updatedAt: now })
            .where(eq(account.id, existingAccount.id))
            .run();
    }
    else {
        db.insert(account).values({
            createdAt: now,
            updatedAt: now,
            id: crypto.randomUUID(),
            userId: existingUser.id,
            providerId: "credential",
            password: hashedPassword,
            accountId: existingUser.id,
        }).run();
    }

    console.log(`Updated password for existing owner "${email}".`);
}
else {
    const userId = crypto.randomUUID();

    db.transaction((tx) => {
        tx.insert(user).values({
            name,
            email,
            id: userId,
            createdAt: now,
            updatedAt: now,
            emailVerified: true,
        }).run();

        tx.insert(account).values({
            userId,
            createdAt: now,
            updatedAt: now,
            accountId: userId,
            id: crypto.randomUUID(),
            providerId: "credential",
            password: hashedPassword,
        }).run();
    });

    console.log(`Created owner account "${email}" (${name}).`);
}
