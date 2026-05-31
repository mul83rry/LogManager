const KEY = 'projects';
export const PALETTE = ['#3b82f6', '#ec4899', '#eab308', '#22c55e', '#8b5cf6', '#f97316', '#06b6d4', '#ef4444'];

export async function getProjects() {
  const { [KEY]: list } = await chrome.storage.local.get(KEY);
  return list || [];
}

export async function addProject(title, color) {
  const projects = await getProjects();
  const id = crypto.randomUUID().replace(/-/g, '').slice(0, 8);
  const proj = { id, title, color: color || PALETTE[projects.length % PALETTE.length] };
  projects.push(proj);
  await chrome.storage.local.set({ [KEY]: projects });
  return proj;
}

export async function updateProject(id, patches) {
  const projects = await getProjects();
  const p = projects.find((x) => x.id === id);
  if (p) {
    Object.assign(p, patches);
    await chrome.storage.local.set({ [KEY]: projects });
  }
}

export async function deleteProject(id) {
  const projects = await getProjects();
  await chrome.storage.local.set({ [KEY]: projects.filter((p) => p.id !== id) });
}
