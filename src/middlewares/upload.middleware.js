import fs from 'fs';
import multer from 'multer';
import path from 'path';

const uploadDir = path.join(process.cwd(), 'uploads', 'consultant_avatars');

// Ensure directory exists
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);
    const uniqueName = `consultant_${Date.now()}_${Math.round(
      Math.random() * 1e9
    )}${ext}`;
    cb(null, uniqueName);
  },
});

const fileFilter = (req, file, cb) => {
  if (!file.mimetype.startsWith('image/')) {
    return cb(new Error('Only image files are allowed'), false);
  }
  cb(null, true);
};

export const uploadConsultantAvatar = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 2 * 1024 * 1024, // 2MB
  },
});

// Consultant onboarding documents (KYC)
const docsDir = path.join(process.cwd(), 'uploads', 'consultant_documents');
if (!fs.existsSync(docsDir)) {
  fs.mkdirSync(docsDir, { recursive: true });
}

const docsStorage = multer.diskStorage({
  destination(req, file, cb) {
    const userId = req.user?.userId || 'unknown';
    const dest = path.join(docsDir, String(userId));
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    cb(null, dest);
  },
  filename(req, file, cb) {
    const ext = path.extname(file.originalname) || '.jpg';
    const uniqueName = `${file.fieldname}_${Date.now()}_${Math.round(
      Math.random() * 1e9
    )}${ext}`;
    cb(null, uniqueName);
  },
});

const docsFileFilter = (req, file, cb) => {
  if (!file.mimetype.startsWith('image/')) {
    return cb(new Error('Only image files are allowed'), false);
  }
  cb(null, true);
};

export const uploadConsultantDocuments = multer({
  storage: docsStorage,
  fileFilter: docsFileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB per file
  },
});
