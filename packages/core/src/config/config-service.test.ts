import { describe, expect, test } from "bun:test";
import { dataPaths } from "../data-dir/paths";
import { NomnomError } from "../errors";
import { createMemoryFileSystem } from "../fs/__mocks__/file-system";
import { defaultConfig } from "./__mocks__/config-service";
import { DEFAULT_CONFIG_TEXT } from "./config";
import { createConfigService } from "./config-service";

const paths = dataPaths("/data");

describe("ConfigService.load", () => {
	test("creates a missing config with the default nutrients and meals", async () => {
		const fs = createMemoryFileSystem();

		const config = await createConfigService({ fs, paths }).load();

		expect(config).toEqual(defaultConfig);
		expect(fs.files.get("/data/config.yaml")).toBe(DEFAULT_CONFIG_TEXT);
	});

	test("never modifies an existing config", async () => {
		const text = [
			"# my config",
			"nutrients:",
			"  - { id: kcal, name: Calories, unit: kcal, required: true }",
			"  - id: vitamin_c",
			"    name: Vitamin C",
			"    unit: mg",
			"meals: [breakfast, second-breakfast, lunch]",
			"",
		].join("\n");
		const fs = createMemoryFileSystem({ "/data/config.yaml": text });
		const writes: string[] = [];
		const service = createConfigService({
			fs: {
				...fs,
				createExclusive: async (path) => {
					writes.push(path);
				},
				replaceAtomic: async (path) => {
					writes.push(path);
				},
			},
			paths,
		});

		const config = await service.load();

		expect(config).toEqual({
			nutrients: [
				{ id: "kcal", name: "Calories", unit: "kcal", required: true },
				{ id: "vitamin_c", name: "Vitamin C", unit: "mg", required: false },
			],
			meals: ["breakfast", "second-breakfast", "lunch"],
		});
		expect(writes).toEqual([]);
		expect(fs.files.get("/data/config.yaml")).toBe(text);
	});

	test("caches the config for the run", async () => {
		const fs = createMemoryFileSystem();
		let reads = 0;
		const service = createConfigService({
			fs: {
				...fs,
				readText: (path) => {
					reads++;
					return fs.readText(path);
				},
			},
			paths,
		});

		const first = await service.load();
		const second = await service.load();

		expect(second).toBe(first);
		expect(reads).toBe(1);
	});

	test("reports an invalid config naming config.yaml", async () => {
		const fs = createMemoryFileSystem({ "/data/config.yaml": "meals: [\n" });

		const error = await createConfigService({ fs, paths })
			.load()
			.catch((e) => e);

		expect(error).toBeInstanceOf(NomnomError);
		expect(error.message).toContain("config.yaml");
		expect(error.problems[0].file).toBe("/data/config.yaml");
	});
});
