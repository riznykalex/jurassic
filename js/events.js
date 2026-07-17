// js/events.js
export const EVENTS = {
  COMMAND_SELECT: 'COMMAND_SELECT',
  COMMAND_MOVE: 'COMMAND_MOVE',
  COMMAND_ATTACK: 'COMMAND_ATTACK',
  COMMAND_BUILD: 'COMMAND_BUILD',
  COMMAND_DESTROY: 'COMMAND_DESTROY',
  COMMAND_DROP_FOOD: 'COMMAND_DROP_FOOD',
  COMMAND_INTERACT: 'COMMAND_INTERACT',
  SELECTION_CHANGED: 'SELECTION_CHANGED',
};

class EventEmitter {
  constructor() {
    this.events = {};
  }

  on(event, listener) {
    if (!this.events[event]) this.events[event] = [];
    this.events[event].push(listener);
  }

  off(event, listener) {
    if (!this.events[event]) return;
    this.events[event] = this.events[event].filter(l => l !== listener);
  }

  emit(event, data) {
    if (!this.events[event]) return;
    this.events[event].forEach(listener => listener(data));
  }
}

export const EventBus = new EventEmitter();