import { expect, test } from "bun:test";
import { createFixedClock } from "./clock/__mocks__/clock";
import { createMemoryFileSystem } from "./fs/__mocks__/file-system";
import type { FileSystem } from "./fs/file-system";
import { createServices } from "./services";

test("createServices does no I/O", () => {
	const fail = (): never => {
		throw new Error("createServices must not touch the file system");
	};
	const fs: FileSystem = {
		readText: fail,
		exists: fail,
		list: fail,
		createExclusive: fail,
		replaceAtomic: fail,
	};

	expect(() =>
		createServices({
			fs,
			clock: createFixedClock(new Date("2026-09-28")),
			dataDir: "/data",
		}),
	).not.toThrow();
});

test("createServices wires every service", () => {
	const services = createServices({
		fs: createMemoryFileSystem(),
		clock: createFixedClock(new Date("2026-09-28")),
		dataDir: "/data",
	});

	expect(Object.keys(services).sort()).toEqual([
		"config",
		"dayLog",
		"foods",
		"recipes",
		"report",
	]);
});

test("the report service reads the data directory", async () => {
	const services = createServices({
		fs: createMemoryFileSystem({
			"/data/logs/2026/2026-09-28.nom": '[lunch]\n"soup" kcal=300\n',
		}),
		// Local noon on 2026-09-28, whatever the time zone.
		clock: createFixedClock(new Date(2026, 8, 28, 12, 0)),
		dataDir: "/data",
	});

	const report = await services.report.report({});

	expect(report.from).toBe("2026-09-28");
	expect(report.totals.get("kcal")).toBe(300);
});
