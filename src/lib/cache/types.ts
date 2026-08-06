export type CacheClient = {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
  del(key: string): Promise<void>;
  delByPattern(pattern: string): Promise<void>;
  setNx(key: string, value: string, ttlSeconds: number): Promise<boolean>;
  /**
   * Добавить элемент в множество и продлить TTL самого множества.
   *
   * Возвращает `false`, если добавить не удалось (Redis недоступен, таймаут
   * команды). Результат обязателен к проверке: вызывающий, который ведёт по
   * множеству учёт своих ключей, при `false` не должен писать сам ключ —
   * иначе появится запись, о которой множество не знает (PERF-21).
   */
  sAdd(key: string, member: string, ttlSeconds: number): Promise<boolean>;
  /**
   * Элементы множества. Пустой массив означает «множества нет ИЛИ прочитать
   * не удалось» — эти случаи намеренно не различаются: у вызывающего на оба
   * один и тот же безопасный ответ (полный перебор), а различение потребовало
   * бы второй команды ради ветки, которой нет.
   */
  sMembers(key: string): Promise<string[]>;
};
