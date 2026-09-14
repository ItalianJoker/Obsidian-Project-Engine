/**
 * Settings tab: project-id pattern/counter, folder map, indexer debounce,
 * and the custom-field schema configurator for the five entity kinds.
 */

import { type App, Notice, PluginSettingTab, Setting } from "obsidian";
import type ProjectsEnginePlugin from "./main";
import type {
	CustomFieldEntityKind,
	CustomFieldSchema,
	CustomFieldType,
} from "./models/types";

const ENTITY_KINDS: { id: CustomFieldEntityKind; label: string }[] = [
	{ id: "customer", label: "Customer" },
	{ id: "team-member", label: "Team member" },
	{ id: "project-type", label: "Project type" },
	{ id: "project-technology", label: "Project technology" },
	{ id: "stakeholder", label: "Stakeholder" },
];

const FIELD_TYPES: CustomFieldType[] = [
	"text",
	"number",
	"date",
	"select",
	"multi-select",
	"person",
	"checkbox",
	"url",
];

/**
 * Projects Engine settings pane.
 */
export class ProjectsEngineSettingTab extends PluginSettingTab {
	constructor(
		app: App,
		private readonly plugin: ProjectsEnginePlugin,
	) {
		super(app, plugin);
	}

	override display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.addClass("projects-engine-settings");

		containerEl.createEl("h2", { text: "Projects Engine" });

		this.renderIdSection();
		this.renderFolderSection();
		this.renderPerformanceSection();
		this.renderCustomFieldsSection();
	}

	private renderIdSection(): void {
		const { containerEl } = this;
		containerEl.createEl("h3", { text: "Project identifiers" });

		new Setting(containerEl)
			.setName("ID pattern")
			.setDesc("Tokens: YYYY, YY, MM, DD, and a run of # for the counter. Example: PRJ-YYYY-###")
			.addText((text) => {
				text.inputEl.addClass("pe-touch-target");
				text.setPlaceholder("PRJ-YYYY-###")
					.setValue(this.plugin.settings.projectIdPattern)
					.onChange(async (value) => {
						this.plugin.settings.projectIdPattern = value.trim() || "PRJ-YYYY-###";
						await this.plugin.saveSettings();
					});
			});

		new Setting(containerEl)
			.setName("Next counter")
			.setDesc("Integer interpolated into the # run. Incremented after each successful project create.")
			.addText((text) => {
				text.inputEl.type = "number";
				text.inputEl.min = "1";
				text.inputEl.addClass("pe-touch-target");
				text.setValue(String(this.plugin.settings.projectIdCounter)).onChange(async (value) => {
					const parsed = Number.parseInt(value, 10);
					if (Number.isFinite(parsed) && parsed >= 1) {
						this.plugin.settings.projectIdCounter = parsed;
						await this.plugin.saveSettings();
					}
				});
			});
	}

	private renderFolderSection(): void {
		const { containerEl } = this;
		containerEl.createEl("h3", { text: "Entity folders" });
		containerEl.createEl("p", {
			cls: "setting-item-description",
			text: "Entity-as-a-Note files are created under these vault-relative folders.",
		});

		this.addFolderSetting("Projects", "projectsFolder");
		this.addFolderSetting("Customers", "customersFolder");
		this.addFolderSetting("Team members", "teamMembersFolder");
		this.addFolderSetting("Project types", "projectTypesFolder");
		this.addFolderSetting("Technologies", "technologiesFolder");
		this.addFolderSetting("Stakeholders", "stakeholdersFolder");
		this.addFolderSetting("Tasks", "tasksFolder");
	}

	private addFolderSetting(
		name: string,
		key:
			| "projectsFolder"
			| "customersFolder"
			| "teamMembersFolder"
			| "projectTypesFolder"
			| "technologiesFolder"
			| "stakeholdersFolder"
			| "tasksFolder",
	): void {
		new Setting(this.containerEl).setName(name).addText((text) => {
			text.inputEl.addClass("pe-touch-target");
			text.setValue(this.plugin.settings[key]).onChange(async (value) => {
				this.plugin.settings[key] = value.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
				await this.plugin.saveSettings();
			});
		});
	}

	private renderPerformanceSection(): void {
		const { containerEl } = this;
		containerEl.createEl("h3", { text: "Performance (mobile)" });

		new Setting(containerEl)
			.setName("Indexer debounce (ms)")
			.setDesc("Quiet period before rebuilding the in-memory entity index after vault events.")
			.addText((text) => {
				text.inputEl.type = "number";
				text.inputEl.min = "50";
				text.inputEl.max = "5000";
				text.inputEl.addClass("pe-touch-target");
				text.setValue(String(this.plugin.settings.indexerDebounceMs)).onChange(async (value) => {
					const parsed = Number.parseInt(value, 10);
					if (Number.isFinite(parsed) && parsed >= 50 && parsed <= 5000) {
						this.plugin.settings.indexerDebounceMs = parsed;
						await this.plugin.saveSettings();
					}
				});
			});

		new Setting(containerEl)
			.setName("Hours per manday")
			.setDesc("Used when rolling time logs into remaining mandays.")
			.addText((text) => {
				text.inputEl.type = "number";
				text.inputEl.min = "1";
				text.inputEl.addClass("pe-touch-target");
				text.setValue(String(this.plugin.settings.hoursPerManday)).onChange(async (value) => {
					const parsed = Number.parseFloat(value);
					if (Number.isFinite(parsed) && parsed > 0) {
						this.plugin.settings.hoursPerManday = parsed;
						await this.plugin.saveSettings();
					}
				});
			});
	}

	private renderCustomFieldsSection(): void {
		const { containerEl } = this;
		containerEl.createEl("h3", { text: "Custom field schemas" });
		containerEl.createEl("p", {
			cls: "setting-item-description",
			text: "Dynamic fields for Customer, Team Member, Project Type, Project Technology, and Stakeholder notes.",
		});

		for (const schema of this.plugin.settings.customFieldSchemas) {
			this.renderSchemaRow(schema);
		}

		containerEl.createEl("h4", { text: "Add field" });
		this.renderAddSchemaForm();
	}

	private renderSchemaRow(schema: CustomFieldSchema): void {
		const row = new Setting(this.containerEl)
			.setName(schema.name)
			.setDesc(`${schema.entity} · ${schema.type}${schema.required ? " · required" : ""}`);

		row.addButton((button) => {
			button.setButtonText("Remove");
			button.buttonEl.addClass("pe-touch-target");
			button.onClick(async () => {
				this.plugin.settings.customFieldSchemas = this.plugin.settings.customFieldSchemas.filter(
					(item) => item.id !== schema.id,
				);
				await this.plugin.saveSettings();
				this.display();
			});
		});
	}

	private renderAddSchemaForm(): void {
		let name = "";
		let entity: CustomFieldEntityKind = "customer";
		let type: CustomFieldType = "text";
		let required = false;
		let optionsCsv = "";

		new Setting(this.containerEl).setName("Name").addText((text) => {
			text.inputEl.addClass("pe-touch-target");
			text.setPlaceholder("Industry").onChange((value) => {
				name = value;
			});
		});

		new Setting(this.containerEl).setName("Entity").addDropdown((dropdown) => {
			for (const kind of ENTITY_KINDS) {
				dropdown.addOption(kind.id, kind.label);
			}
			dropdown.setValue(entity);
			dropdown.selectEl.addClass("pe-touch-target");
			dropdown.onChange((value) => {
				entity = value as CustomFieldEntityKind;
			});
		});

		new Setting(this.containerEl).setName("Type").addDropdown((dropdown) => {
			for (const fieldType of FIELD_TYPES) {
				dropdown.addOption(fieldType, fieldType);
			}
			dropdown.setValue(type);
			dropdown.selectEl.addClass("pe-touch-target");
			dropdown.onChange((value) => {
				type = value as CustomFieldType;
			});
		});

		new Setting(this.containerEl)
			.setName("Required")
			.addToggle((toggle) => {
				toggle.setValue(required).onChange((value) => {
					required = value;
				});
			});

		new Setting(this.containerEl)
			.setName("Select options")
			.setDesc("Comma-separated labels, used when type is select or multi-select.")
			.addText((text) => {
				text.inputEl.addClass("pe-touch-target");
				text.setPlaceholder("Low, Medium, High").onChange((value) => {
					optionsCsv = value;
				});
			});

		new Setting(this.containerEl).addButton((button) => {
			button.setButtonText("Add custom field");
			button.setCta();
			button.buttonEl.addClass("pe-touch-target");
			button.onClick(async () => {
				const trimmed = name.trim();
				if (!trimmed) {
					new Notice("Custom field name is required");
					return;
				}
				const options = optionsCsv
					.split(",")
					.map((item) => item.trim())
					.filter((item) => item.length > 0)
					.map((label, index) => ({
						id: `opt_${index + 1}_${label.toLowerCase().replace(/\s+/g, "-")}`,
						label,
					}));
				const schema: CustomFieldSchema = {
					id: `cf_${Date.now().toString(36)}`,
					name: trimmed,
					type,
					entity,
					required,
					options,
					defaultValue: type === "checkbox" ? false : type === "multi-select" ? [] : "",
				};
				this.plugin.settings.customFieldSchemas.push(schema);
				await this.plugin.saveSettings();
				new Notice(`Added custom field “${trimmed}”`);
				this.display();
			});
		});
	}
}
