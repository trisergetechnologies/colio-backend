import User, {
  CONSULTANT_CATEGORIES,
  CONSULTANT_SKILLS,
} from '../../models/User.js';
import { uploadImageAndGetUrl } from '../../services/mediaStorage.service.js';
import {
  HOST_AGREEMENT_VERSION,
} from '../../constants/hostAgreement.js';

function effectiveAppStatus(user) {
  if (user.role !== 'consultant') return null;
  return user.consultantProfile?.applicationStatus ?? 'approved';
}

function hasProfileComplete(user) {
  if (!user.dateOfBirth || !user.gender) return false;
  if (!user.languages?.length) return false;
  const cat = user.consultantProfile?.category;
  if (!cat || !CONSULTANT_CATEGORIES.includes(cat)) return false;
  if (!user.consultantProfile?.bio?.trim()) return false;
  if (!user.consultantProfile?.skills?.length) return false;
  return true;
}

function hasBankComplete(user) {
  const b = user.consultantProfile?.bankDetails;
  if (!b) return false;
  const req = [
    b.accountHolderName,
    b.bankName,
    b.accountNumber,
    b.ifscCode,
    b.upiId,
  ];
  return req.every((x) => String(x || '').trim().length > 0);
}

const REQUIRED_DOC_TYPES = ['aadhaar_front', 'aadhaar_back', 'pan', 'profile_photo'];

function hasAllDocuments(user) {
  const types = new Set((user.documents || []).map((d) => d.type));
  return REQUIRED_DOC_TYPES.every((t) => types.has(t));
}

function upsertDoc(documents, type, url) {
  const list = documents || [];
  const filtered = list.filter((d) => d.type !== type);
  filtered.push({
    type,
    url,
    verified: false,
    uploadedAt: new Date(),
  });
  return filtered;
}

export const getOnboardingStatus = async (req, res) => {
  try {
    const userId = req.user.userId;
    const user = await User.findById(userId);
    if (!user || user.role !== 'consultant') {
      return res.status(200).json({
        success: false,
        message: 'Consultant not found',
      });
    }

    const applicationStatus = effectiveAppStatus(user);
    const missing = {
      profile: [],
      bank: [],
      documents: [],
      agreementSigned: user.consultantProfile?.agreement?.signed === true,
    };

    if (!user.dateOfBirth) missing.profile.push('dateOfBirth');
    if (!user.gender) missing.profile.push('gender');
    if (!user.languages?.length) missing.profile.push('languages');
    if (
      !user.consultantProfile?.category ||
      !CONSULTANT_CATEGORIES.includes(user.consultantProfile.category)
    ) {
      missing.profile.push('category');
    }
    if (!user.consultantProfile?.bio?.trim()) missing.profile.push('bio');
    if (!user.consultantProfile?.skills?.length) missing.profile.push('skills');

    const b = user.consultantProfile?.bankDetails;
    if (!b?.accountHolderName?.trim()) missing.bank.push('accountHolderName');
    if (!b?.bankName?.trim()) missing.bank.push('bankName');
    if (!b?.accountNumber?.trim()) missing.bank.push('accountNumber');
    if (!b?.ifscCode?.trim()) missing.bank.push('ifscCode');
    if (!b?.upiId?.trim()) missing.bank.push('upiId');

    const haveTypes = new Set((user.documents || []).map((d) => d.type));
    for (const t of REQUIRED_DOC_TYPES) {
      if (!haveTypes.has(t)) missing.documents.push(t);
    }

    return res.json({
      success: true,
      data: {
        applicationStatus,
        agreementSigned: user.consultantProfile?.agreement?.signed === true,
        agreementVersionSigned: user.consultantProfile?.agreement?.version || null,
        missing,
        documents: user.documents || [],
        readyForAgreement:
          hasProfileComplete(user) &&
          hasBankComplete(user) &&
          hasAllDocuments(user) &&
          applicationStatus === 'pending_profile',
      },
    });
  } catch (e) {
    console.error('getOnboardingStatus error:', e);
    return res.status(500).json({ success: false, message: 'Failed to load status' });
  }
};

export const putOnboardingProfile = async (req, res) => {
  try {
    const userId = req.user.userId;
    const user = await User.findById(userId);
    if (!user || user.role !== 'consultant') {
      return res.status(200).json({ success: false, message: 'Consultant not found' });
    }

    const applicationStatus = effectiveAppStatus(user);
    if (applicationStatus === 'rejected') {
      return res.status(200).json({
        success: false,
        message: 'Your application was rejected. Contact support.',
      });
    }
    if (applicationStatus !== 'pending_profile') {
      return res.status(200).json({
        success: false,
        message: 'Profile cannot be edited at this stage.',
      });
    }

    const {
      dateOfBirth,
      gender,
      languages,
      category,
      skills,
      bio,
      bankDetails,
    } = req.body;

    if (dateOfBirth !== undefined) user.dateOfBirth = dateOfBirth ? new Date(dateOfBirth) : null;
    if (gender !== undefined) user.gender = gender || null;

    if (languages !== undefined) {
      if (!Array.isArray(languages)) {
        return res.status(200).json({
          success: false,
          message: 'languages must be an array',
        });
      }
      user.languages = languages;
    }

    if (category !== undefined) {
      if (!CONSULTANT_CATEGORIES.includes(category)) {
        return res.status(200).json({
          success: false,
          message: 'Invalid category',
        });
      }
      user.consultantProfile.category = category;
    }

    if (skills !== undefined) {
      if (!Array.isArray(skills)) {
        return res.status(200).json({ success: false, message: 'skills must be an array' });
      }
      user.consultantProfile.skills = skills.filter(
        (s) => typeof s === 'string' && CONSULTANT_SKILLS.includes(s)
      );
    }

    if (bio !== undefined) user.consultantProfile.bio = bio || '';

    if (bankDetails !== undefined && typeof bankDetails === 'object') {
      user.consultantProfile.bankDetails = {
        ...user.consultantProfile.bankDetails,
        ...bankDetails,
      };
      if (bankDetails.ifscCode) {
        user.consultantProfile.bankDetails.ifscCode = String(
          bankDetails.ifscCode
        ).toUpperCase();
      }
      if (bankDetails.upiId) {
        user.consultantProfile.bankDetails.upiId = String(
          bankDetails.upiId
        ).toLowerCase();
      }
    }

    await user.save();

    return res.json({
      success: true,
      message: 'Profile updated',
      data: {
        applicationStatus: effectiveAppStatus(user),
      },
    });
  } catch (e) {
    console.error('putOnboardingProfile error:', e);
    if (e.name === 'ValidationError') {
      const messages = Object.values(e.errors).map((x) => x.message);
      return res.status(200).json({ success: false, message: messages.join(', ') });
    }
    return res.status(500).json({ success: false, message: 'Update failed' });
  }
};

export const postOnboardingDocuments = async (req, res) => {
  try {
    const userId = req.user.userId;
    const user = await User.findById(userId);
    if (!user || user.role !== 'consultant') {
      return res.status(200).json({ success: false, message: 'Consultant not found' });
    }

    const applicationStatus = effectiveAppStatus(user);
    if (applicationStatus === 'rejected') {
      return res.status(200).json({
        success: false,
        message: 'Your application was rejected. Contact support.',
      });
    }
    if (applicationStatus !== 'pending_profile') {
      return res.status(200).json({
        success: false,
        message: 'Documents cannot be changed at this stage.',
      });
    }

    const files = {};
    if (Array.isArray(req.files)) {
      for (const f of req.files) {
        files[f.fieldname] = f;
      }
    } else if (req.files && typeof req.files === 'object') {
      for (const [field, list] of Object.entries(req.files)) {
        const first = Array.isArray(list) ? list[0] : list;
        if (first) files[field] = first;
      }
    }

    const map = {
      aadhaarFront: 'aadhaar_front',
      aadhaarBack: 'aadhaar_back',
      panCard: 'pan',
      profilePhoto: 'profile_photo',
    };

    let docs = user.documents || [];

    for (const [field, docType] of Object.entries(map)) {
      const file = files[field];
      if (file?.filename) {
        const url = await uploadImageAndGetUrl({
          req,
          file,
          folder: `colio/consultant_documents/${userId}`,
          fallbackPath: `consultant_documents/${userId}/${file.filename}`,
        });
        docs = upsertDoc(docs, docType, url);
        if (field === 'profilePhoto') {
          user.avatar = url;
        }
      }
    }

    if (Object.keys(files).length === 0) {
      return res.status(200).json({
        success: false,
        message:
          'No files received. Upload at least one document (aadhaarFront, aadhaarBack, panCard, profilePhoto).',
      });
    }

    user.documents = docs;
    await user.save();

    return res.json({
      success: true,
      message: 'Documents updated',
      data: {
        documents: user.documents,
        avatar: user.avatar,
        applicationStatus: effectiveAppStatus(user),
      },
    });
  } catch (e) {
    console.error('postOnboardingDocuments error:', e);
    return res.status(500).json({ success: false, message: 'Upload failed' });
  }
};

export const postOnboardingAgreement = async (req, res) => {
  try {
    const userId = req.user.userId;
    const user = await User.findById(userId);
    if (!user || user.role !== 'consultant') {
      return res.status(200).json({ success: false, message: 'Consultant not found' });
    }

    const applicationStatus = effectiveAppStatus(user);
    if (applicationStatus === 'rejected') {
      return res.status(200).json({
        success: false,
        message: 'Your application was rejected. Contact support.',
      });
    }
    if (applicationStatus !== 'pending_profile') {
      return res.status(200).json({
        success: false,
        message: 'Agreement already submitted or not applicable.',
      });
    }

    const { signedName, version, acknowledgments } = req.body;

    if (!version || version !== HOST_AGREEMENT_VERSION) {
      return res.status(200).json({
        success: false,
        message: `Please accept the current agreement version (${HOST_AGREEMENT_VERSION}).`,
      });
    }

    const ack = acknowledgments || {};
    const keys = [
      'readUnderstood',
      'voluntarily',
      'contentPolicy',
      'personalInfoLiability',
      'ageEligibility',
      'truthfulInfo',
    ];
    for (const k of keys) {
      if (!ack[k]) {
        return res.status(200).json({
          success: false,
          message: 'All acknowledgments must be accepted.',
        });
      }
    }

    if (!signedName || !String(signedName).trim()) {
      return res.status(200).json({
        success: false,
        message: 'Signed name is required.',
      });
    }

    if (
      String(signedName).trim().toLowerCase() !==
      String(user.name).trim().toLowerCase()
    ) {
      return res.status(200).json({
        success: false,
        message: 'Signed name must match your registered full name exactly.',
      });
    }

    if (!hasProfileComplete(user)) {
      return res.status(200).json({
        success: false,
        message: 'Complete your profile before signing.',
        code: 'INCOMPLETE_PROFILE',
      });
    }
    if (!hasBankComplete(user)) {
      return res.status(200).json({
        success: false,
        message: 'Complete bank details before signing.',
        code: 'INCOMPLETE_BANK',
      });
    }
    if (!hasAllDocuments(user)) {
      return res.status(200).json({
        success: false,
        message: 'Upload all required documents before signing.',
        code: 'INCOMPLETE_DOCUMENTS',
      });
    }

    const ip =
      req.ip ||
      req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
      req.connection?.remoteAddress ||
      '';

    user.consultantProfile.agreement = {
      signed: true,
      signedName: String(signedName).trim(),
      signedAt: new Date(),
      version: HOST_AGREEMENT_VERSION,
      ipAddress: ip,
      userAgent: req.get('user-agent') || '',
      acknowledgments: {
        readUnderstood: true,
        voluntarily: true,
        contentPolicy: true,
        personalInfoLiability: true,
        ageEligibility: true,
        truthfulInfo: true,
      },
    };
    user.consultantProfile.applicationStatus = 'pending_approval';

    await user.save();

    return res.json({
      success: true,
      message: 'Agreement signed. Your application is pending admin approval.',
      data: {
        applicationStatus: effectiveAppStatus(user),
      },
    });
  } catch (e) {
    console.error('postOnboardingAgreement error:', e);
    return res.status(500).json({ success: false, message: 'Failed to sign agreement' });
  }
};
