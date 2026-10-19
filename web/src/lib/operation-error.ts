/** Regra de negócio cuja mensagem pode ser apresentada ao usuário. */
export class OperationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OperationError';
  }
}
