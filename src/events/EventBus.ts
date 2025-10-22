import EventEmitter from 'events';

export type EventBusEvent = {
  type: string;
  payload: any;
};

export type EventListener = (event: EventBusEvent) => void;

export class EventBus {
  private emitter = new EventEmitter();

  publish(event: EventBusEvent): void {
    this.emitter.emit(event.type, event);
    this.emitter.emit('*', event);
  }

  subscribe(type: string, listener: EventListener): () => void {
    this.emitter.on(type, listener);
    return () => this.emitter.off(type, listener);
  }

  subscribeAll(listener: EventListener): () => void {
    this.emitter.on('*', listener);
    return () => this.emitter.off('*', listener);
  }
}
