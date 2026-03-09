import "@components/template-generator";
import { TemplateGenerator } from "@components/template-generator";

type UserData = {
    name: string;
    role: string;
};

type BadgeData = {
    icon: string;
    label: string;
};

type PostData = {
    title: string;
    content: string;
};

// 1. Register a template descriptor
TemplateGenerator.registry.register<HTMLElement, UserData>({
    name: "user-card",
    template(data) {
        const card = document.createElement("div");
        card.className = "user-card";
        card.innerHTML = `
			<strong data-name></strong>
			<div class="role" data-role></div>
		`;
        return card;
    },
    hydrate(instance, data) {
        if (!instance || !data) return;
        const nameEl = instance.querySelector("[data-name]") as HTMLElement;
        const roleEl = instance.querySelector("[data-role]") as HTMLElement;
        if (nameEl) nameEl.textContent = data.name;
        if (roleEl) roleEl.textContent = data.role;
    },
    cleanup() { },
    defaultData: { name: "Guest", role: "User" }
});

const users: UserData[] = [
    { name: "Ada Lovelace", role: "Architect" },
    { name: "Grace Hopper", role: "Engineer" },
    { name: "Alan Turing", role: "Researcher" }
];

const badges: BadgeData[] = [
    { icon: "✅", label: "Active" },
    { icon: "⚠️", label: "Warning" },
    { icon: "🚀", label: "Deployed" }
];

const posts: PostData[] = [
    { title: "First Post", content: "This is the first post content." },
    { title: "Second Post", content: "This is the second post content." },
    { title: "Third Post", content: "This is the third post content." }
];

// Get generator elements
const genRegistry = document.querySelector("#gen-registry") as TemplateGenerator;
const genDocument = document.querySelector("#gen-document") as TemplateGenerator;
const genChild = document.querySelector("#gen-child") as TemplateGenerator;

let userIndex = 0;
let badgeIndex = 0;
let postIndex = 0;

// 1. Registry-based template interaction
document.querySelector("#btn-registry")?.addEventListener("click", () => {
    userIndex = (userIndex + 1) % users.length;
    genRegistry.hydrate(users[userIndex]);
});

// 2. Document template by ID interaction
document.querySelector("#btn-document")?.addEventListener("click", () => {
    badgeIndex = (badgeIndex + 1) % badges.length;
    const data = badges[badgeIndex];

    // Manually update DOM (no hydrate function for document templates)
    const node = genDocument.watchedElement;
    if (node) {
        const iconEl = node.querySelector("[data-icon]") as HTMLElement;
        const labelEl = node.querySelector("[data-label]") as HTMLElement;
        if (iconEl) iconEl.textContent = data.icon;
        if (labelEl) labelEl.textContent = data.label;
    }
});

// 3. Child template element interaction
document.querySelector("#btn-child")?.addEventListener("click", () => {
    postIndex = (postIndex + 1) % posts.length;
    const data = posts[postIndex];

    // Manually update DOM (no registered hydrate function)
    const node = genChild.watchedElement;
    if (node) {
        const titleEl = node.querySelector("[data-title]") as HTMLElement;
        const contentEl = node.querySelector("[data-content]") as HTMLElement;
        if (titleEl) titleEl.textContent = data.title;
        if (contentEl) contentEl.textContent = data.content;
    }
});

// Initial render
genRegistry.hydrate(users[0]);
genDocument.hydrate(badges[0]);

// Initialize child template demo – call hydrate to create the instance
genChild.hydrate(posts[0]);
