import { ItemView, WorkspaceLeaf, TextComponent, ToggleComponent, CheckboxComponent } from "obsidian";
import PomodoroPlugin from "./main";
import { TimerState, PomodoroSettings } from "./PomoTimer";
import { TaskModal } from "./TaskModal";

export const POMO_VIEW_TYPE = "pomodoro-view";

export class PomoView extends ItemView {
    plugin: PomodoroPlugin;

    private timeEl: HTMLElement;
    private resetButton: HTMLButtonElement;
    private modeContainer: HTMLElement;
    private completedSessionsEl: HTMLElement;
    private totalFocusTimeEl: HTMLElement;
    private statsPeriod: 'daily' | 'weekly' = 'daily';
    private progressBarEl: HTMLElement;
    private taskCountEl: HTMLElement;
    private taskListEl: HTMLElement;


    constructor(leaf: WorkspaceLeaf, plugin: PomodoroPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType() {
        return POMO_VIEW_TYPE;
    }

    getDisplayText() {
        return "Pomodoro Timer";
    }

    async onOpen() {
        const container = this.containerEl.children[1];
        container.empty();
        container.createEl("h4", { text: "Pomodoro Timer" });

        // Timer
        const timerContainer = container.createEl("div", { cls: "pomodoro-timer-container" });
        this.timeEl = timerContainer.createEl("div", { cls: "pomodoro-panel-time" });
        this.timeEl.onclick = () => {
            this.plugin.handlePauseResumeClick();
        };

        const timerButtonsContainer = timerContainer.createEl("div", {cls: "pomodoro-timer-buttons"});

        this.resetButton = timerButtonsContainer.createEl("button", { text: "Reset" });
        this.resetButton.onclick = () => {
            this.plugin.handleResetClick();
        };

        const settingsButton = timerButtonsContainer.createEl("button", { text: "Settings" });
        settingsButton.onclick = () => {
            this.plugin.app.setting.open();
            this.plugin.app.setting.openTabById(this.plugin.manifest.id);
        };

        // Mode selection
        this.modeContainer = container.createEl("div", { cls: "pomodoro-modes" });


        // Statistics
        const statsContainer = container.createEl("div", { cls: "pomodoro-stats" });

        const statsToggleContainer = statsContainer.createEl("div", { cls: "pomodoro-stats-toggle" });
        new ToggleComponent(statsToggleContainer)
            .onChange((value) => {
                this.statsPeriod = value ? 'weekly' : 'daily';
                this.updateStats();
            });

        const cardsContainer = statsContainer.createEl("div", { cls: "pomodoro-stats-cards" });
        const completedSessionsCard = cardsContainer.createEl("div", { cls: "pomodoro-stats-card" });
        this.completedSessionsEl = completedSessionsCard.createEl("div");

        const totalFocusTimeCard = cardsContainer.createEl("div", { cls: "pomodoro-stats-card" });
        this.totalFocusTimeEl = totalFocusTimeCard.createEl("div");

        this.updateModeButtons();
        this.updateStats();

        // Settings
        const settingsContainer = container.createEl("div", { cls: "pomodoro-settings" });
        settingsContainer.createEl("h5", { text: "Settings" });

        const createSetting = (labelText: string, settingKey: keyof PomodoroSettings) => {
            const settingEl = settingsContainer.createEl("div", { cls: "pomodoro-setting" });
            settingEl.createEl("label", { text: labelText });
            const input = new TextComponent(settingEl);
            input.inputEl.type = "number";
            input.setValue(String(this.plugin.settings[settingKey]));
            input.onChange(async (value) => {
                (this.plugin.settings[settingKey] as number) = Number(value);
                await this.plugin.saveSettings();
            });
        };

        createSetting("Focus minutes", "workTime");
        createSetting("Short break minutes", "shortBreakTime");
        createSetting("Long break minutes", "longBreakTime");

        // Tasks Section
        const tasksContainer = container.createEl("div", { cls: "pomodoro-tasks" });
        const details = tasksContainer.createEl("details");
        const summary = details.createEl("summary");

        const summaryHeader = summary.createEl("div", { cls: "pomodoro-tasks-header" });
        summaryHeader.createEl("span", { text: "Tasks" });

        const progressContainer = summaryHeader.createEl("div", { cls: "pomodoro-tasks-progress" });
        this.progressBarEl = progressContainer.createEl("div", { cls: "pomodoro-progress-bar" });
        this.taskCountEl = summaryHeader.createEl("span", { cls: "pomodoro-task-count" });

        const addButton = summary.createEl("button", { text: "+" });
        addButton.onclick = (e) => {
            e.preventDefault();
            new TaskModal(this.plugin.app, (text) => {
                this.plugin.addTask(text);
            }).open();
        };

        this.taskListEl = details.createEl("div", { cls: "pomodoro-task-list" });

        this.updateTasks();

        this.plugin.onPomoViewOpen(this);
    }

    async onClose() {
        this.plugin.onPomoViewClose();
    }

    updateTimer(remainingTime: number, totalTime: number, state: TimerState) {
        const minutes = Math.floor(remainingTime / 60).toString().padStart(2, '0');
        const seconds = (remainingTime % 60).toString().padStart(2, '0');

        if (state === TimerState.Idle) {
            this.timeEl.setText(this.plugin.getIdleTimeText());
        } else {
            this.timeEl.setText(`${minutes}:${seconds}`);
        }

        // The start button is gone, so no need to update its text.
    }

    updateStats() {
        if (!this.completedSessionsEl || !this.totalFocusTimeEl) {
            return;
        }
        const stats = this.plugin.getStats(this.statsPeriod);
        this.completedSessionsEl.setText(`Sessions Completed: ${stats.completedPomodoros}`);
        this.totalFocusTimeEl.setText(`Focus Time: ${Math.floor(stats.totalFocusTime / 60)}m`);
    }

    updateModeButtons() {
        this.modeContainer.empty();
        const modes = [
            { state: TimerState.Work, text: "Focus" },
            { state: TimerState.ShortBreak, text: "Short Break" },
            { state: TimerState.LongBreak, text: "Long Break" },
        ];

        modes.forEach(mode => {
            const button = this.modeContainer.createEl("button", { text: mode.text });
            if (this.plugin.currentMode === mode.state) {
                button.addClass("is-active");
            }
            button.onclick = () => {
                if (this.plugin.timer.getState() === TimerState.Idle) {
                    this.plugin.setMode(mode.state);
                    this.updateModeButtons();
                }
            };
        });
    }

    updateTasks() {
        if (!this.taskListEl) {
            return;
        }

        this.taskListEl.empty();
        const tasks = this.plugin.settings.tasks;
        const completedTasks = tasks.filter(task => task.completed).length;

        // Update progress bar and count
        this.taskCountEl.setText(`${completedTasks}/${tasks.length}`);
        const progressPercent = tasks.length > 0 ? (completedTasks / tasks.length) * 100 : 0;
        this.progressBarEl.style.width = `${progressPercent}%`;

        // Render tasks
        tasks.forEach((task, index) => {
            const taskEl = this.taskListEl.createEl("div", { cls: "pomodoro-task-item" });

            new CheckboxComponent(taskEl)
                .setValue(task.completed)
                .onChange(async (checked) => {
                    this.plugin.settings.tasks[index].completed = checked;
                    await this.plugin.saveSettings();
                    this.updateTasks();
                });

            const textEl = taskEl.createEl("span");
            const linkRegex = /\[\[(.*?)\]\]/g;
            let lastIndex = 0;
            let match;

            while ((match = linkRegex.exec(task.text)) !== null) {
                if (match.index > lastIndex) {
                    textEl.appendText(task.text.substring(lastIndex, match.index));
                }

                const linkText = match[1];
                const linkEl = textEl.createEl("a", { text: linkText });
                linkEl.onclick = () => {
                    this.plugin.app.workspace.openLinkText(linkText, '');
                };

                lastIndex = match.index + match[0].length;
            }

            if (lastIndex < task.text.length) {
                textEl.appendText(task.text.substring(lastIndex));
            }
        });
    }
}
