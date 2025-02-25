import { VimMessage, VimSession } from "../deps.ts";
import { Host, Invoker } from "./base.ts";

export class Vim implements Host {
  #session: VimSession;
  #listener: Promise<void>;

  constructor(
    reader: Deno.Reader & Deno.Closer,
    writer: Deno.Writer,
  ) {
    this.#session = new VimSession(reader, writer);
    this.#listener = this.#session.listen();
  }

  async call(func: string, ...args: unknown[]): Promise<unknown> {
    const result = await this.#session.call(func, ...args);
    // Make sure that everything is up to date after the command
    await this.#session.redraw();
    return result;
  }

  listen(invoker: Invoker): Promise<void> {
    this.#session.replaceCallback(async function (message: VimMessage) {
      const [msgid, expr] = message;
      let ok = null;
      let err = null;
      try {
        ok = await dispatch(invoker, expr);
      } catch (e) {
        err = e;
      }
      if (msgid !== 0) {
        await this.reply(msgid, [ok, err]);
      } else if (err !== null) {
        console.error(err);
      }
    });
    return this.#listener;
  }
}

async function dispatch(invoker: Invoker, expr: unknown): Promise<unknown> {
  if (isInvokeMessage(expr)) {
    const [_, method, args] = expr;
    if (!(method in invoker)) {
      throw new Error(`Method '${method}' is not defined in the invoker`);
    }
    // deno-lint-ignore no-explicit-any
    return await (invoker as any)[method](...args);
  } else {
    throw new Error(
      `Unexpected JSON channel message is received: ${JSON.stringify(expr)}`,
    );
  }
}

type InvokeMessage = ["invoke", string, unknown[]];

function isInvokeMessage(data: unknown): data is InvokeMessage {
  return (
    Array.isArray(data) &&
    data.length === 3 &&
    data[0] === "invoke" &&
    typeof data[1] === "string" &&
    Array.isArray(data[2])
  );
}
