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
		"check",
		"config",
		"dayLog",
		"foods",
		"recipes",
		"report",
		"search",
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

test("the check service reads the data directory", async () => {
	const services = createServices({
		fs: createMemoryFileSystem({
			"/data/logs/2026/2026-09-28.nom": "[lunch]\nrice@1 80\n",
			"/data/logs/2026/2026-9-29.nom": "",
		}),
		clock: createFixedClock(new Date("2026-09-28")),
		dataDir: "/data",
	});

	const result = await services.check.check();

	expect(result.errors.map(({ file, line }) => `${file}:${line}`)).toEqual([
		"/data/logs/2026/2026-09-28.nom:2",
		"/data/logs/2026/2026-9-29.nom:undefined",
	]);
	expect(result.checked).toEqual({ foods: 0, recipes: 0, days: 1 });
});
