import type { GlobalCategory } from "@prisma/client";

export type SortedCategory = GlobalCategory & {
  depth: number;
  fullPath: string;
};

function compareNames(a: string, b: string): number {
  return a.localeCompare(b, "ru", { sensitivity: "base" });
}

export function sortCategoriesHierarchically(categories: GlobalCategory[]): SortedCategory[] {
  if (categories.length === 0) return [];

  const byParent = new Map<string | null, GlobalCategory[]>();
  const byId = new Map(categories.map((category) => [category.id, category] as const));

  for (const category of categories) {
    const parentId = category.parentId && byId.has(category.parentId) ? category.parentId : null;
    const bucket = byParent.get(parentId) ?? [];
    bucket.push(category);
    byParent.set(parentId, bucket);
  }

  for (const [parentId, bucket] of byParent.entries()) {
    bucket.sort((a, b) => {
      const byName = compareNames(a.name, b.name);
      if (byName !== 0) return byName;
      const byOrder = a.orderIndex - b.orderIndex;
      if (byOrder !== 0) return byOrder;
      return a.id.localeCompare(b.id);
    });
    byParent.set(parentId, bucket);
  }

  const visited = new Set<string>();
  const result: SortedCategory[] = [];

  const visit = (category: GlobalCategory, depth: number, parentPath: string) => {
    if (visited.has(category.id)) return;
    visited.add(category.id);

    const fullPath = parentPath ? `${parentPath} > ${category.name}` : category.name;
    result.push({ ...category, depth, fullPath });

    const children = byParent.get(category.id) ?? [];
    for (const child of children) {
      visit(child, depth + 1, fullPath);
    }
  };

  for (const root of byParent.get(null) ?? []) {
    visit(root, 0, "");
  }

  return result;
}
