import { asyncHandler } from '../Utils/asyncHandler.js';
import { COOKIE_NAME } from '../Utils/token.js';
import { userDto } from '../Utils/serialize.js';
import { env } from '../Config/env.js';
import * as authService from '../Service/authService.js';
import * as sessionService from '../Service/sessionService.js';

// Frontend and API are on different domains in production, so the cookie must be SameSite=None; Secure
const cookieOptions = () => ({
  httpOnly: true, secure: env.isProd, sameSite: env.isProd ? 'none' : 'lax', maxAge: 12 * 60 * 60 * 1000,
});

export const login = asyncHandler(async (req, res) => {
  const { token, user } = await authService.login(req.body.username, req.body.password);
  res.cookie(COOKIE_NAME, token, cookieOptions());
  res.json({ user: userDto(user), token });
});

export const logout = asyncHandler(async (req, res) => {
  await sessionService.closeSession(req.user);   // blocked (409) while serving a customer
  const { maxAge, ...opts } = cookieOptions();
  res.clearCookie(COOKIE_NAME, opts);
  res.json({ ok: true });
});

export const me = (req, res) => res.json({ user: userDto(req.user) });
