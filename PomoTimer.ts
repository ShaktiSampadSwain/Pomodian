export enum TimerState {
    Work,
    ShortBreak,
    LongBreak,
    Paused,
    Idle
}

export class PomoTimer {
    private state: TimerState = TimerState.Idle;
    private prePauseState: TimerState = TimerState.Idle;
    private remainingTime: number = 0;
    private totalTime: number = 0;
    private intervalId: number | null = null;
    private onTick: (remainingTime: number, totalTime: number) => void;
    private onStateChange: (state: TimerState) => void;
    private onTimerComplete: () => void;
    private settings: PomodoroSettings;

    constructor(
        settings: PomodoroSettings, 
        onTick: (remainingTime: number, totalTime: number) => void, 
        onStateChange: (state: TimerState) => void,
        onTimerComplete: () => void
    ) {
        this.settings = settings;
        this.onTick = onTick;
        this.onStateChange = onStateChange;
        this.onTimerComplete = onTimerComplete;
    }

    public updateSettings(settings: PomodoroSettings) {
        this.settings = settings;
    }

    start(state: TimerState) {
        if (state === TimerState.Idle || state === TimerState.Paused) return;
        
        this.state = state;

        // Only reset time if it's a new session
        if (this.remainingTime === 0) {
            switch (this.state) {
                case TimerState.Work: 
                    this.remainingTime = this.settings.workTime * 60; 
                    break;
                case TimerState.ShortBreak: 
                    this.remainingTime = this.settings.shortBreakTime * 60; 
                    break;
                case TimerState.LongBreak: 
                    this.remainingTime = this.settings.longBreakTime * 60; 
                    break;
            }
            this.totalTime = this.remainingTime;
        }
        
        if (this.intervalId) {
            clearInterval(this.intervalId);
        }

        this.intervalId = window.setInterval(() => {
            this.remainingTime--;
            this.onTick(this.remainingTime, this.totalTime);
            
            if (this.remainingTime <= 0) {
                const completedState = this.state;
                this.stop();
                this.onTimerComplete();
                this.onStateChange(completedState);
            }
        }, 1000);
        
        this.onTick(this.remainingTime, this.totalTime);
    }

    pause() {
        if (this.intervalId && this.state !== TimerState.Idle && this.state !== TimerState.Paused) {
            clearInterval(this.intervalId);
            this.intervalId = null;
            this.prePauseState = this.state;
            this.state = TimerState.Paused;
            this.onTick(this.remainingTime, this.totalTime);
        }
    }

    resume() {
        if (this.state === TimerState.Paused) {
            this.start(this.prePauseState);
        }
    }

    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        this.state = TimerState.Idle;
        this.remainingTime = 0;
        this.totalTime = 0;
        this.onTick(this.remainingTime, this.totalTime);
    }

    reset() {
        this.stop();
        // Reset to show full time for current mode
        this.onTick(0, 0);
    }

    getState(): TimerState {
        return this.state;
    }

    getRemainingTime(): number {
        return this.remainingTime;
    }

    getTotalTime(): number {
        return this.totalTime;
    }

    isRunning(): boolean {
        return this.state !== TimerState.Idle && this.state !== TimerState.Paused;
    }
}

export interface Session {
    date: string; // ISO string
    type: TimerState;
    duration: number; // in seconds
}

export interface Task {
    text: string;
    completed: boolean;
}

export interface PomodoroSettings {
    workTime: number;
    shortBreakTime: number;
    longBreakTime: number;
    longBreakInterval: number;
    autoStartBreaks: boolean;
    autoStartPomodoros: boolean;
    showDesktopNotification: boolean;
    playSound: boolean;
    showInStatusBar: boolean;
    sessions: Session[];
    tasks: Task[];
}

export const DEFAULT_SETTINGS: PomodoroSettings = {
    workTime: 25,
    shortBreakTime: 5,
    longBreakTime: 15,
    longBreakInterval: 4,
    autoStartBreaks: false,
    autoStartPomodoros: false,
    showDesktopNotification: true,
    playSound: true,
    showInStatusBar: false,
    sessions: [],
    tasks: [],
};