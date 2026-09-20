/**
 * Unit tests for View Entity metadata, Stakeholder email/mail support,
 * and entity association resolution logic.
 */
import { describe, expect, it } from "vitest";
import {
	VIEW_ENTITY_KINDS,
	VIEW_ENTITY_META,
} from "../src/views/ViewEntityModal";
import { type Stakeholder, DEFAULT_SETTINGS } from "../src/models/types";
import { EntityIndexer } from "../src/engine/Indexer";
import { TFile, TFolder, type Vault } from "obsidian";
import { ensureEntityNote, appendEntityLink } from "../src/services/linkSync";
import { splitFrontmatter } from "../src/services/frontmatter";

describe("ViewEntityModal metadata", () => {
	it("contains exactly the 4 configured entity kinds without team-member", () => {
		expect(VIEW_ENTITY_KINDS).toEqual([
			"customer",
			"stakeholder",
			"project-type",
			"project-technology",
		]);
		expect(VIEW_ENTITY_KINDS).not.toContain("team-member");
	});

	it("has metadata labels and icons for all kinds", () => {
		expect(VIEW_ENTITY_META.customer.label).toBe("Customer");
		expect(VIEW_ENTITY_META.stakeholder.label).toBe("Stakeholder");
		expect(VIEW_ENTITY_META["project-type"].label).toBe("Type");
		expect(VIEW_ENTITY_META["project-technology"].label).toBe("Tech");

		expect(VIEW_ENTITY_META.customer.plural).toBe("Customers");
		expect(VIEW_ENTITY_META.stakeholder.plural).toBe("Stakeholders");
	});
});

describe("Stakeholder model with email/mail", () => {
	it("allows defining stakeholder with email", () => {
		const stakeholder: Stakeholder = {
			name: "Mario Rossi",
			filePath: "Projects/Entities/Stakeholders/Mario Rossi.md",
			wikiLink: "[[Mario Rossi]]",
			email: "mario.rossi@example.com",
			role: "Product Owner",
			projects: ["[[PRJ-001]]"],
			customFields: {},
		};

		expect(stakeholder.email).toBe("mario.rossi@example.com");
		expect(stakeholder.role).toBe("Product Owner");
		expect(stakeholder.projects).toContain("[[PRJ-001]]");
	});
});

describe("EntityIndexer with Stakeholder email and team-member unification", () => {
	it("indexes stakeholder with email and role from frontmatter", () => {
		const mockFile = new TFile();
		mockFile.path = "Projects/Entities/Stakeholders/Jane Doe.md";
		mockFile.basename = "Jane Doe";

		const files = [mockFile];
		const cache: Record<string, { frontmatter?: Record<string, unknown> }> = {
			"Projects/Entities/Stakeholders/Jane Doe.md": {
				frontmatter: {
					pe_type: "stakeholder",
					email: "jane.doe@example.com",
					role: "Lead Architect",
					customer: "[[Acme Corp]]",
					projects: ["[[Cloud Migration]]"],
				},
			},
		};

		const app = {
			vault: {
				getMarkdownFiles: () => files,
				getAbstractFileByPath: (p: string) => (p === mockFile.path ? mockFile : null),
			},
			metadataCache: {
				getFileCache: (file: TFile) => cache[file.path],
			},
		};

		const indexer = new EntityIndexer(app as any, () => DEFAULT_SETTINGS, 0);
		indexer.rebuild();

		const stakeholders = indexer.getStakeholders();
		expect(stakeholders).toHaveLength(1);
		expect(stakeholders[0]?.name).toBe("Jane Doe");
		expect(stakeholders[0]?.email).toBe("jane.doe@example.com");
		expect(stakeholders[0]?.role).toBe("Lead Architect");
		expect(stakeholders[0]?.customer).toBe("[[Acme Corp]]");
		expect(stakeholders[0]?.projects).toEqual(["[[Cloud Migration]]"]);
	});

	it("indexes stakeholder with 'mail' field as email fallback", () => {
		const mockFile = new TFile();
		mockFile.path = "Projects/Entities/Stakeholders/Bob Smith.md";
		mockFile.basename = "Bob Smith";

		const files = [mockFile];
		const cache: Record<string, { frontmatter?: Record<string, unknown> }> = {
			"Projects/Entities/Stakeholders/Bob Smith.md": {
				frontmatter: {
					pe_type: "stakeholder",
					mail: "bob@smith.org",
					role: "Developer",
				},
			},
		};

		const app = {
			vault: {
				getMarkdownFiles: () => files,
				getAbstractFileByPath: (p: string) => (p === mockFile.path ? mockFile : null),
			},
			metadataCache: {
				getFileCache: (file: TFile) => cache[file.path],
			},
		};

		const indexer = new EntityIndexer(app as any, () => DEFAULT_SETTINGS, 0);
		indexer.rebuild();

		const stakeholders = indexer.getStakeholders();
		expect(stakeholders).toHaveLength(1);
		expect(stakeholders[0]?.name).toBe("Bob Smith");
		expect(stakeholders[0]?.email).toBe("bob@smith.org");
	});

	it("indexes legacy team-member notes as stakeholders", () => {
		const mockFile = new TFile();
		mockFile.path = "Projects/Entities/Team Members/Alice Johnson.md";
		mockFile.basename = "Alice Johnson";

		const files = [mockFile];
		const cache: Record<string, { frontmatter?: Record<string, unknown> }> = {
			"Projects/Entities/Team Members/Alice Johnson.md": {
				frontmatter: {
					pe_type: "team-member",
					email: "alice@team.corp",
					default_role: "Tech Lead",
				},
			},
		};

		const app = {
			vault: {
				getMarkdownFiles: () => files,
				getAbstractFileByPath: (p: string) => (p === mockFile.path ? mockFile : null),
			},
			metadataCache: {
				getFileCache: (file: TFile) => cache[file.path],
			},
		};

		const indexer = new EntityIndexer(app as any, () => DEFAULT_SETTINGS, 0);
		indexer.rebuild();

		const stakeholders = indexer.getStakeholders();
		expect(stakeholders).toHaveLength(1);
		expect(stakeholders[0]?.name).toBe("Alice Johnson");
		expect(stakeholders[0]?.email).toBe("alice@team.corp");
		expect(stakeholders[0]?.role).toBe("Tech Lead");

		// list("team-member") routes to stakeholders
		const fromLegacyList = indexer.list("team-member" as any);
		expect(fromLegacyList).toHaveLength(1);
		expect(fromLegacyList[0]?.name).toBe("Alice Johnson");
	});
});

describe("Entity to project relationship resolution", () => {
	const projects = [
		{
			id: "PRJ-01",
			name: "Portal Redesign",
			customer: "[[Acme]]",
			projectType: "Web App",
			technologies: ["React", "TypeScript"],
			team: ["Alice", "Bob"],
			stakeholders: ["Carol"],
			file: { path: "Projects/PRJ-01/PRJ-01.md" } as any,
		},
		{
			id: "PRJ-02",
			name: "Cloud Infra",
			customer: "Beta Corp",
			projectType: "Cloud",
			technologies: ["Docker", "Kubernetes"],
			team: ["Bob"],
			stakeholders: ["Alice"],
			file: { path: "Projects/PRJ-02/PRJ-02.md" } as any,
		},
	];

	function stripWiki(raw: string): string {
		return raw.replace(/^\[\[/, "").replace(/\]\]$/, "").split("|")[0]?.trim() ?? "";
	}

	it("resolves projects associated with a customer", () => {
		const acmeProjects = projects.filter(
			(p) => stripWiki(p.customer).toLowerCase() === "acme".toLowerCase(),
		);
		expect(acmeProjects).toHaveLength(1);
		expect(acmeProjects[0]?.id).toBe("PRJ-01");
	});

	it("resolves projects associated with a stakeholder across team or stakeholders", () => {
		const aliceProjects = projects.filter((p) => {
			const inTeam = p.team.some((t) => stripWiki(t).toLowerCase() === "alice");
			const inStakeholders = p.stakeholders.some((s) => stripWiki(s).toLowerCase() === "alice");
			return inTeam || inStakeholders;
		});
		expect(aliceProjects).toHaveLength(2);
		expect(aliceProjects.map((p) => p.id)).toEqual(["PRJ-01", "PRJ-02"]);
	});

	it("resolves projects associated with a technology", () => {
		const reactProjects = projects.filter((p) =>
			p.technologies.some((t) => stripWiki(t).toLowerCase() === "react"),
		);
		expect(reactProjects).toHaveLength(1);
		expect(reactProjects[0]?.id).toBe("PRJ-01");
	});
});

describe("ensureEntityNote and bidirectional link synchronization", () => {
	it("creates a new entity note if it does not exist", async () => {
		const files: Map<string, { file: TFile; content: string }> = new Map();
		const folders: Set<string> = new Set();

		const vault = {
			getRoot: () => new TFolder(),
			getAbstractFileByPath: (p: string) => files.get(p)?.file ?? null,
			getMarkdownFiles: () => Array.from(files.values()).map((e) => e.file),
			createFolder: async (p: string) => {
				folders.add(p);
				const f = new TFolder();
				f.path = p;
				return f;
			},
			create: async (p: string, content: string) => {
				const f = new TFile();
				f.path = p;
				f.basename = p.split("/").pop()!.replace(/\.md$/, "");
				files.set(p, { file: f, content });
				return f;
			},
			process: async (f: TFile, fn: (cur: string) => string) => {
				const entry = files.get(f.path) ?? { file: f, content: "" };
				entry.content = fn(entry.content);
				files.set(f.path, entry);
				return entry.content;
			},
		} as unknown as Vault;

		const created = await ensureEntityNote(
			vault,
			"customer",
			"[[Acme Corp|Acme]]",
			"Projects/Entities/Customers",
		);

		expect(created).not.toBeNull();
		expect(created?.basename).toBe("Acme Corp");
		const stored = files.get("Projects/Entities/Customers/Acme Corp.md");
		expect(stored).toBeDefined();
		const { data, body } = splitFrontmatter(stored!.content);
		expect(data.pe_type).toBe("customer");
		expect(data.name).toBe("Acme Corp");
		expect(body).toContain("# Acme Corp");
	});

	it("returns existing note if it already exists in folder or elsewhere in vault", async () => {
		const existingFile = new TFile();
		existingFile.path = "OtherFolder/Existing Tech.md";
		existingFile.basename = "Existing Tech";

		const files: Map<string, { file: TFile; content: string }> = new Map([
			[
				existingFile.path,
				{
					file: existingFile,
					content: "---\npe_type: technology\nname: Existing Tech\n---\n# Existing Tech",
				},
			],
		]);

		const vault = {
			getAbstractFileByPath: (p: string) => files.get(p)?.file ?? null,
			getMarkdownFiles: () => Array.from(files.values()).map((e) => e.file),
		} as unknown as Vault;

		const result = await ensureEntityNote(
			vault,
			"technology",
			"existing tech",
			"Projects/Entities/Technologies",
		);

		expect(result).toBe(existingFile);
	});

	it("correctly creates referenced customer and syncs bidirectional links when saving stakeholder", async () => {
		const files: Map<string, { file: TFile; content: string }> = new Map();

		const vault = {
			getRoot: () => new TFolder(),
			getAbstractFileByPath: (p: string) => files.get(p)?.file ?? null,
			getMarkdownFiles: () => Array.from(files.values()).map((e) => e.file),
			createFolder: async () => new TFolder(),
			create: async (p: string, content: string) => {
				const f = new TFile();
				f.path = p;
				f.basename = p.split("/").pop()!.replace(/\.md$/, "");
				files.set(p, { file: f, content });
				return f;
			},
			process: async (f: TFile, fn: (cur: string) => string) => {
				const entry = files.get(f.path) ?? { file: f, content: "" };
				entry.content = fn(entry.content);
				files.set(f.path, entry);
				return entry.content;
			},
		} as unknown as Vault;

		// 1. Stakeholder "Alice" is being created referencing customer "Beta Corp"
		const customerFile = await ensureEntityNote(
			vault,
			"customer",
			"Beta Corp",
			"Projects/Entities/Customers",
		);
		expect(customerFile).not.toBeNull();

		// 2. Stakeholder file is created
		const stakeholderFile = await ensureEntityNote(
			vault,
			"stakeholder",
			"Alice",
			"Projects/Entities/Stakeholders",
		);
		expect(stakeholderFile).not.toBeNull();

		// 3. Bidirectional link: add Alice to customer's stakeholders list
		await appendEntityLink(
			vault,
			customerFile!,
			"stakeholders",
			"[[Alice]]",
			"Stakeholder",
			"list",
		);

		// 4. Bidirectional link: set customer on Alice's note
		await appendEntityLink(
			vault,
			stakeholderFile!,
			"customer",
			"[[Beta Corp]]",
			"Customer",
			"scalar",
		);

		// Verify Customer note
		const custEntry = files.get("Projects/Entities/Customers/Beta Corp.md")!;
		const custData = splitFrontmatter(custEntry.content);
		expect(custData.data.pe_type).toBe("customer");
		expect(custData.data.stakeholders).toContain("[[Alice]]");
		expect(custData.body).toContain("- Stakeholder: [[Alice]]");

		// Verify Stakeholder note
		const stkhEntry = files.get("Projects/Entities/Stakeholders/Alice.md")!;
		const stkhData = splitFrontmatter(stkhEntry.content);
		expect(stkhData.data.pe_type).toBe("stakeholder");
		expect(stkhData.data.customer).toBe("[[Beta Corp]]");
		expect(stkhData.body).toContain("- Customer: [[Beta Corp]]");
	});
});


