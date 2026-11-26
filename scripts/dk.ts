const args = process.argv.slice(2);

const result = Bun.spawnSync(["bun", "run", "drizzle-kit", ...args], {
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
});

process.exit(result.exitCode);
