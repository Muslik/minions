import { readFileSync, existsSync } from "fs";
import { join } from "path";

export function loadTemplate(promptsDir: string, name: string): string {
  const withExt = name.endsWith(".md") ? name : `${name}.md`;
  const filePath = join(promptsDir, withExt);
  if (!existsSync(filePath)) {
    throw new Error(`Prompt template not found: ${filePath}`);
  }
  return readFileSync(filePath, "utf-8");
}

export function renderTemplate(
  template: string,
  vars: Record<string, string>
): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    return key in vars ? vars[key]! : `{{${key}}}`;
  });
}
