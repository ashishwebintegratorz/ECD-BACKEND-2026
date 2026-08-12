import assert from "node:assert/strict";
import test from "node:test";
import type { NextFunction, Request, Response } from "express";
import { requireRestaurantAccess } from "../middlewares/restaurantAccess.middleware.js";

const restaurantId = "6a7c81a8fd80503fd1c0e7cd";

function authorize(user: unknown, requestedRestaurantId = restaurantId) {
    let error: unknown;
    let allowed = false;
    const req = {
        params: { restaurantId: requestedRestaurantId },
        user,
    } as unknown as Request;
    const next = ((nextError?: unknown) => {
        error = nextError;
        allowed = nextError === undefined;
    }) as NextFunction;

    requireRestaurantAccess(req, {} as Response, next);
    return { allowed, error };
}

test("allows administrators to access any restaurant", () => {
    const result = authorize({ role: "admin", _id: "admin" }, "other");
    assert.equal(result.allowed, true);
    assert.equal(result.error, undefined);
});

test("allows a restaurant to access its own resources", () => {
    const result = authorize({ role: "restaurant", _id: restaurantId });
    assert.equal(result.allowed, true);
    assert.equal(result.error, undefined);
});

test("denies a restaurant access to another restaurant", () => {
    const result = authorize({ role: "restaurant", _id: restaurantId }, "other");
    assert.equal(result.allowed, false);
    assert.match((result.error as Error).message, /permission/);
});

test("denies unsupported roles", () => {
    const result = authorize({ role: "user", _id: restaurantId });
    assert.equal(result.allowed, false);
    assert.match((result.error as Error).message, /permission/);
});

test("denies missing authentication", () => {
    const result = authorize(undefined);
    assert.equal(result.allowed, false);
    assert.equal((result.error as Error).message, "Not authenticated");
});
