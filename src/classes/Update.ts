import { label } from "../utils/stateStrings";

export enum UPDATE_TYPES {
   accomplished,
   goal,
   block,
   question,
   help,
   prayer,
   personal,
}

export interface EditedUpdate {
   accomplished: string;
   goal: string;
   block?: string;
   question?: string;
   help?: string;
   prayer?: string;
   personal?: string;
}

export interface Line {
   type: keyof typeof UPDATE_TYPES;
   reference?: string;
   wasGoal?: boolean;
   note: string;
}

function L(key: string, type: keyof typeof UPDATE_TYPES) {
   return label("update", key, type);
}

export default class Update {
   private lines: Line[] = [];
   private editedUpdate!: EditedUpdate;
   private edited = false;
   private githubOwner = "digi-serve";
   private githubUrl = "https://github.com/";

   get goals() {
      return this.lines.filter((line) => line.type == "goal");
   }

   add(line: Line): void {
      this.lines.push(line);
   }

   edit(update: EditedUpdate): void {
      this.editedUpdate = update;
      this.edited = true;
   }

   generate(section?: keyof typeof UPDATE_TYPES): string {
      if (section) {
         return this.generateSection(section);
      } else if (this.edited) {
         return this.generateEdited();
      } else {
         return this.generateAll();
      }
   }

   private generateAll(): string {
      const report: string[] = [];
      for (let index = 0; index < 7; index++) {
         const type = UPDATE_TYPES[index] as keyof typeof UPDATE_TYPES;
         const lines = this.lines.filter((line) => line.type == type);
         if (index > 0 && lines.length < 1) continue;
         report.push(`**${L("headings", type) ?? type}:**`);
         lines.forEach((line) => {
            report.push(this.formatLine(line));
         });
         // Extra line after section
         report.push(" ");
      }
      return report.join("\n");
   }

   private formatLine(line: Line): string {
      const referenceRegex = /(^[^#]+)#(\d+)/;
      let reference;
      if (referenceRegex.test(line.reference ?? "")) {
         const [, repo, number] = line.reference?.match(referenceRegex) ?? [];
         reference = `[${repo}#${number}](${this.githubUrl}${this.githubOwner}/${repo}/issues/${number})`;
      }
      const useOther = line.type == "accomplished" || line.type == "goal";
      const emoji = line.wasGoal ? ":tada:" : L("emojis", line.type);
      const prefix = reference ? reference : useOther ? "Other" : "";
      const spacer = /\S/.test(prefix) ? " - " : ""; // If our prefix has non space characters add the seperator
      return ` ${emoji} ${prefix}${spacer}${line.note}`;
   }

   private generateSection(type: keyof typeof UPDATE_TYPES): string {
      if (this.edited) return this.generateEditedSection(type);
      const lines = this.lines
         .filter((line) => line.type == type)
         .map((line) => this.formatLine(line));
      return lines.join("\n");
   }

   private generateEdited(): string {
      const sections: string[] = [];
      for (const key in this.editedUpdate) {
         if (!this.editedUpdate[key]) continue; // skip null
         const type = key as keyof typeof UPDATE_TYPES;
         sections.push(`**${L("headings", type) ?? key}:**`);
         sections.push(this.editedUpdate[key]);
         sections.push(" "); // Empty Line between sections
      }
      return sections.join("\n");
   }

   private generateEditedSection(type: keyof typeof UPDATE_TYPES): string {
      return this.editedUpdate[type] ?? "";
   }
}
