import { Request } from 'express';
import { AppUser, IAppUser } from '../models/AppUser.js';

export const getAuthUser = async (req: Request): Promise<IAppUser | null> => {
  const uid =
    (req.headers['x-user-uid'] as string) ||
    req.body?.requestorUid ||
    req.body?.userUid ||
    (req.query?.userUid as string);

  if (!uid) return null;
  const user = await AppUser.findOne({ uid });
  return user;
};
