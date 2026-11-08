import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { LESSONS, isLeader, lessonFor, lessonsFor } from "./learn";
import { canOpen, type Viewer } from "./nav";
import { SCENES, Scene } from "@/components/learn/scenes";

// Права ролей — как в seed 0005
const ROLE_PERMS: Record<string, string[]> = {
  manager: ["leads.view", "leads.receive", "leads.manage", "clients.view", "clients.manage", "prices.view", "projects.view_all", "projects.create", "projects.manage", "content.plan", "content.manage", "tasks.view_all", "tasks.manage", "shoots.manage", "calendar.view_all", "employees.view", "employees.invite", "reports.view", "payments.create"],
  accountant: ["finance.view", "finance.manage", "payments.create", "payments.confirm", "expenses.create", "expenses.confirm", "payroll.view", "payroll.manage", "payroll.pay", "prices.view", "reports.view", "clients.view", "projects.view_all"],
  sales: ["leads.view", "leads.receive", "clients.manage", "prices.view", "projects.create", "payments.create"],
  project_manager: ["projects.create", "content.plan", "content.manage", "tasks.manage", "shoots.manage", "calendar.view_all"],
  targetologist: ["campaigns.manage"],
  mobilographer: [],
  editor: [],
  storymaker: [],
};
const viewer = (role: string): Viewer => {
  const isOwner = role === "owner";
  const perms = new Set(ROLE_PERMS[role] ?? []);
  return { roles: [role], isOwner, can: (p) => isOwner || perms.has(p) };
};
const ids = (role: string) => lessonsFor(viewer(role)).map((l) => l.id);
const scenes = (role: string, id: string) => lessonFor(viewer(role), id)?.lesson.steps.map((s) => s.scene) ?? [];
const ROLES = ["owner", ...Object.keys(ROLE_PERMS)];
const LEAD_ONLY = ["add-employee", "add-project", "give-work", "plan-day", "review", "money"];
const STAFF_CORE = ["my-tasks", "do-task", "submit-work", "redo"];

describe("обучение: кому что показывается", () => {
  it("руководитель видит, как вести работу, в нужном порядке", () => {
    expect(ids("owner")).toEqual(["start", "add-employee", "add-project", "give-work", "plan-day", "review", "leads", "money"]);
    expect(isLeader(viewer("manager"))).toBe(true);
    for (const id of STAFF_CORE) expect(ids("owner")).not.toContain(id);
    for (const id of STAFF_CORE) expect(ids("manager")).not.toContain(id);
  });

  it("сотрудник видит только свою часть", () => {
    for (const role of ["mobilographer", "editor", "storymaker"]) {
      expect(ids(role).slice(0, 5), role).toEqual(["start", ...STAFF_CORE]);
      for (const id of LEAD_ONLY) expect(ids(role), `${role}:${id}`).not.toContain(id);
    }
  });

  it("дополнительные уроки — только нужным ролям", () => {
    expect(ids("mobilographer")).toContain("shoots");
    expect(ids("editor")).not.toContain("shoots");
    expect(ids("storymaker")).toContain("stories");
    expect(ids("targetologist")).toContain("ads");
    expect(ids("mobilographer")).not.toContain("ads");
    expect(ids("sales")).toContain("leads");
    expect(ids("accountant")).toContain("money");
    expect(ids("accountant")).not.toContain("add-employee");
  });

  it("шаги зависят от прав: управляющая не открывает доступ сама", () => {
    expect(scenes("owner", "add-employee")).toContain("team-approve");
    expect(scenes("owner", "add-employee")).not.toContain("team-ask-owner");
    expect(scenes("manager", "add-employee")).toContain("team-ask-owner");
    expect(scenes("manager", "add-employee")).not.toContain("team-approve");
  });

  it("управляющая видит только доступные ей шаги бухгалтерии", () => {
    expect(scenes("manager", "money")).toEqual(["money-income"]);
    expect(scenes("accountant", "money")).toEqual(["money-overview", "money-income", "money-confirm", "money-expense", "money-payroll"]);
  });

  it("чужой урок по прямой ссылке недоступен", () => {
    expect(lessonFor(viewer("mobilographer"), "money")).toBeNull();
    expect(lessonFor(viewer("mobilographer"), "add-employee")).toBeNull();
    expect(lessonFor(viewer("owner"), "submit-work")).toBeNull();
    expect(lessonFor(viewer("owner"), "нет-такого")).toBeNull();
  });

  it("у каждой роли есть уроки, и все они не пустые", () => {
    for (const r of ROLES) {
      const list = lessonsFor(viewer(r));
      expect(list.length, r).toBeGreaterThanOrEqual(2);
      for (const l of list) expect(l.steps.length, `${r}:${l.id}`).toBeGreaterThan(0);
    }
  });

  it("следующий урок идёт по порядку, последний — без следующего", () => {
    const list = lessonsFor(viewer("editor"));
    expect(lessonFor(viewer("editor"), list[0].id)?.next?.id).toBe(list[1].id);
    expect(lessonFor(viewer("editor"), list[list.length - 1].id)?.next).toBeNull();
  });

  it("ссылки ведут только в разрешённые разделы", () => {
    for (const r of ROLES) {
      const v = viewer(r);
      for (const l of lessonsFor(v)) for (const s of l.steps) if (s.link) expect(canOpen(v, s.link.href), `${r}:${s.link.href}`).toBe(true);
    }
  });
});

describe("обучение: содержание и картинки", () => {
  const steps = LESSONS.flatMap((l) => l.steps);

  it("у каждого шага своя картинка", () => {
    const all = steps.map((s) => s.scene);
    expect(new Set(all).size).toBe(all.length);
    for (const s of all) expect(SCENES[s], s).toBeTypeOf("function");
  });

  it("нет лишних картинок без шага", () => {
    const used = new Set(steps.map((s) => s.scene));
    expect(Object.keys(SCENES).filter((k) => !used.has(k))).toEqual([]);
  });

  it("тексты короткие", () => {
    for (const s of steps) {
      expect(s.title.length, s.title).toBeLessThanOrEqual(32);
      expect(s.text.split(/\s+/).length, s.text).toBeLessThanOrEqual(22);
    }
  });

  it("id уроков уникальны", () => {
    expect(new Set(LESSONS.map((l) => l.id)).size).toBe(LESSONS.length);
  });

  it("картинки рисуются, берут цвета темы и не содержат букв и id", () => {
    for (const name of Object.keys(SCENES)) {
      const html = renderToStaticMarkup(createElement(Scene, { name }));
      expect(html, name).toContain("<svg");
      expect(html, name).toContain("var(--brand)");
      expect(html, name).not.toContain("<text");
      expect(html, name).not.toMatch(/\sid="/);
      expect(html, name).toContain('aria-hidden="true"');
    }
  });
});
