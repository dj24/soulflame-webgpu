// interface Singleton<T> {
//   instance: T;
// }

// type SingletonConstructor<T> = new (...args: any[]) => Singleton<T>;

abstract class Singleton {
  static #instance: Singleton;

  protected constructor(...args: any[]) {
    if (Singleton.#instance) {
      return Singleton.#instance;
    }
    Singleton.#instance = new (this.constructor as any)(...args);
  }
}

// export const Singleton = <T extends SingletonConstructor<T>>(
//   constructor: T,
// ) => {
//   return class extends constructor {
//     constructor(...args: any[]) {
//       super(...args);
//       this.instance = this;
//     }
//   };
// };
