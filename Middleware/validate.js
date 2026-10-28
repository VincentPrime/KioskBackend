/** validate(zodSchema, 'body' | 'query' | 'params') -> replaces req[source] with the parsed value */
export const validate = (schema, source = 'body') => (req, _res, next) => {
  const result = schema.safeParse(req[source]);
  if (!result.success) return next(result.error);
  req[source] = result.data;
  next();
};
