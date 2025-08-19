import { App, Modal, TextComponent, ButtonComponent } from "obsidian";

export class TaskModal extends Modal {
    onSubmit: (text: string) => void;

    constructor(app: App, onSubmit: (text: string) => void) {
        super(app);
        this.onSubmit = onSubmit;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.createEl("h2", { text: "Add New Task" });

        const textComponent = new TextComponent(contentEl)
            .setPlaceholder("Enter your task");

        new ButtonComponent(contentEl)
            .setButtonText("Add Task")
            .setCta()
            .onClick(() => {
                const text = textComponent.getValue();
                if (text) {
                    this.onSubmit(text);
                    this.close();
                }
            });
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}
