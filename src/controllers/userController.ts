import { Request, Response } from 'express';
import { AppUser, UserRole } from '../models/AppUser.js';

// Developer emails — only these can be "developer" role (set in .env with comma or ||)
const getDeveloperEmails = (): string[] => {
  const envVal = process.env.DEVELOPER_EMAILS || 'dorunagps@gmail.com,tanvirislamtamim41@gmail.com';
  return envVal
    .split(/[,|]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
};

// ─── Sync / Get user role ────────────────────────────────────────────────────
// Called after Firebase login. Creates or fetches the user record.
export const syncOrGetUserRole = async (req: Request, res: Response): Promise<void> => {
  try {
    const { uid, email, displayName } = req.body;

    if (!uid || !email) {
      res.status(400).json({ success: false, message: 'uid and email are required' });
      return;
    }

    const emailLower = email.toLowerCase();
    const devEmails = getDeveloperEmails();
    let user = await AppUser.findOne({ uid });

    if (!user) {
      // Check if user already exists by email (e.g. earlier account or different login provider)
      user = await AppUser.findOne({ email: emailLower });
      if (user) {
        user.uid = uid;
        if (displayName && !user.displayName) user.displayName = displayName;
        if (devEmails.includes(emailLower) && user.role !== 'developer') {
          user.role = 'developer';
        }
        await user.save();
      } else {
        // First time login → auto-assign role
        const role: UserRole = devEmails.includes(emailLower) ? 'developer' : 'user';
        user = new AppUser({ uid, email: emailLower, displayName: displayName || '', role });
        await user.save();
      }
    } else {
      // Auto-promote to developer if listed in DEVELOPER_EMAILS
      if (devEmails.includes(emailLower) && user.role !== 'developer') {
        user.role = 'developer';
        await user.save();
      }
      // Update displayName if changed
      if (displayName && user.displayName !== displayName) {
        user.displayName = displayName;
        await user.save();
      }
    }

    res.json({ success: true, data: { uid: user.uid, email: user.email, displayName: user.displayName, role: user.role } });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── Get all users (Developer only) ─────────────────────────────────────────
export const getAllUsers = async (req: Request, res: Response): Promise<void> => {
  try {
    const users = await AppUser.find({}).sort({ createdAt: -1 });
    res.json({ success: true, count: users.length, data: users });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── Update user role (Developer only) ──────────────────────────────────────
export const updateUserRole = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;           // MongoDB _id
    const { role, requestorUid } = req.body;

    // Validate role
    const validRoles: UserRole[] = ['developer', 'dealer', 'admin', 'user'];
    if (!validRoles.includes(role)) {
      res.status(400).json({ success: false, message: `Invalid role. Must be one of: ${validRoles.join(', ')}` });
      return;
    }

    // Verify requestor is a developer
    const requestor = await AppUser.findOne({ uid: requestorUid });
    if (!requestor || requestor.role !== 'developer') {
      res.status(403).json({ success: false, message: 'Only developers can change user roles.' });
      return;
    }

    const user = await AppUser.findByIdAndUpdate(id, { role }, { new: true });
    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    res.json({
      success: true,
      message: `${user.displayName || user.email}-এর ভূমিকা "${role}"-এ পরিবর্তন করা হয়েছে।`,
      data: user,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── Delete user (Developer only) ────────────────────────────────────────────
export const deleteUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { requestorUid } = req.body;

    const requestor = await AppUser.findOne({ uid: requestorUid });
    if (!requestor || requestor.role !== 'developer') {
      res.status(403).json({ success: false, message: 'Only developers can delete users.' });
      return;
    }

    const user = await AppUser.findByIdAndDelete(id);
    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    res.json({ success: true, message: `${user.email} সিস্টেম থেকে সরানো হয়েছে।` });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
};
