import { expect, test } from "bun:test";
import { createFixedClock } from "./clock/__mocks__/clock";
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
		createServices({ fs, clock: createFixedClock(new Date("2026-09-28")) }),
	).not.toThrow();
});
