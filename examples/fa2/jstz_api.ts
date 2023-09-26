export type Address = string;
export function isAddress(addr : Address) : addr is Address {
  return typeof(addr) === 'string';
}

export declare namespace Kv {
  function get(key: string) : unknown;
  function set(key: string, value: any);
  function delete(key: string);
  function has(key: string) : boolean;
}
export declare namespace Ledger {
  function selfAddress () : Address;
  function createContract (code : String) : Promise<Address>;
}
export declare namespace Contract {
  async function call(request: Request) : Promise<Response>;
}
export declare namespace TextEncoder {
  function atob(data: string) : string;
  function btoa(data: string) : string;
}