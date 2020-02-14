import crypto from 'crypto';
import mongoose from 'mongoose';
import validator from 'validator';
import bcrypt from 'bcryptjs';

export type TUserRoles = 'user' | 'guide' | 'lead-guide' | 'admin';

interface IUserSchema extends mongoose.Document {
  name: string;
  email: string;
  photo: string;
  role: TUserRoles;
  password?: string;
  passwordConfirm?: string;
  passwordChangedAt?: Date;
  passwordResetToken?: string;
  passwordResetExpires?: Date;
  active: boolean;
}

export interface IUser extends IUserSchema {
  // Virtuals and schema methods
  correctPassword: (
    candidatePassword: string,
    userPassword: string
  ) => Promise<boolean>;
  changedPasswordAfter: (JWTTimestamp: number) => boolean;
  createPasswordResetToken: () => string;
}

// export interface IUser extends IUserBase {
//   // For ObjectID refs
//   // company: ICompany["_id"];
// }

// export interface IUserPopulated extends IUserBase {
//   // refs
//   // company: ICompany;
// }

export interface IUserModel extends mongoose.Model<IUser> {}

const userSchema = new mongoose.Schema<IUser>({
  name: {
    type: String,
    required: [true, 'Please provide your name']
  },
  email: {
    type: String,
    required: [true, 'Please provide your email'],
    unique: true,
    lowercase: true,
    validate: [validator.isEmail, 'Please provide a valid email']
  },
  photo: {
    type: String,
    default: 'default.jpg'
  },
  role: {
    type: String,
    enum: ['user', 'guide', 'lead-guide', 'admin'],
    default: 'user'
  },
  password: {
    type: String,
    required: [true, 'Please provide a password'],
    minlength: [8, 'Password must have at least 8 characters'],
    select: false
  },
  passwordConfirm: {
    type: String,
    required: [true, 'Please confirm your password'],
    validate: {
      // This only works on CREATE and SAVE
      validator: function(el: string): boolean {
        return el === this.password;
      },
      message: 'Passwords do not match'
    } as any
  },
  passwordChangedAt: Date,
  passwordResetToken: String,
  passwordResetExpires: Date,
  active: {
    type: Boolean,
    default: true,
    select: false
  }
});

userSchema.pre<IUser>('save', async function(next) {
  // Only run function is password was modified
  if (!this.isModified('password')) return next();

  // Hash the password
  this.password = await bcrypt.hash(this.password!, 12);
  // Delete passwordconfirm
  this.passwordConfirm = undefined;
  next();
});

userSchema.pre<IUser>('save', function(next) {
  if (!this.isModified('password') || this.isNew) return next();

  const now = new Date();
  this.passwordChangedAt = new Date(now.getTime() - 1000);
  next();
});

userSchema.pre<mongoose.Query<IUser>>(/^find/, function(next) {
  // this points to the current query
  this.find({ active: { $ne: false } });
  next();
});

userSchema.methods.correctPassword = async function(
  candidatePassword,
  userPassword
) {
  return await bcrypt.compare(candidatePassword, userPassword);
};

userSchema.methods.changedPasswordAfter = function(JWTTimestamp) {
  if (this.passwordChangedAt) {
    const changedTimestamp = this.passwordChangedAt.getTime() / 1000;
    return JWTTimestamp < changedTimestamp;
  }

  // False means password not changed
  return false;
};

userSchema.methods.createPasswordResetToken = function() {
  const resetToken = crypto.randomBytes(32).toString('hex');

  this.passwordResetToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');

  const now = new Date();
  this.passwordResetExpires = new Date(now.getTime() + 10 * 60 * 1000);

  return resetToken;
};

const User = mongoose.model<IUser, IUserModel>('User', userSchema);

export default User;
