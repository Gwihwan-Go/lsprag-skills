// Test fixture for call hierarchy tests.
// Call graph:
//   main -> handleRequest -> parseBody
//                         -> sendResponse -> formatJson
//   routeGet  -> handleRequest
//   routePost -> handleRequest
//   standalone (no callers, no callees)

export function parseBody(req: any): any {
    return JSON.parse(req.body);
}

export function formatJson(data: any): string {
    return JSON.stringify(data, null, 2);
}

export function sendResponse(res: any, body: any): void {
    const formatted = formatJson(body);
    res.send(formatted);
}

export function handleRequest(req: any, res: any): void {
    const body = parseBody(req);
    sendResponse(res, body);
}

export function routeGet(req: any, res: any): void {
    handleRequest(req, res);
}

export function routePost(req: any, res: any): void {
    handleRequest(req, res);
}

export function main(): void {
    const app = { get: routeGet, post: routePost };
    handleRequest({} as any, {} as any);
}

export function standalone(): void {
    console.log("I have no callers and call nothing interesting");
}
