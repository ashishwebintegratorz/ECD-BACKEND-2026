import type { RequestHandler } from "express";

type ParsableSchema = { parse: (arg: any) => any };

export const validate =
  (schema: ParsableSchema): RequestHandler =>
    (req, res, next) => {
      try {
        schema.parse({ body: req.body, query: req.query, params: req.params });
        return next();
      } catch (err) {
        return next(err);
      }
    };
