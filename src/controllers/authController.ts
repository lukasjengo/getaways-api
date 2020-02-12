import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

import { promisify } from 'util';

import jwt from 'jsonwebtoken';

import User, { IUser, TUserRoles } from '../models/userModel';
import catchAsync from '../utils/catchAsync';
import AppError from '../utils/appError';
import { Email } from '../utils/email';

const signToken = (id: string) => {
  return jwt.sign({ id }, process.env.JWT_SECRET!, {
    expiresIn: process.env.JWT_EXPIRES_IN
  });
};

const createSendToken = (
  user: IUser,
  statusCode: number,
  req: Request,
  res: Response
) => {
  const token = signToken(user._id);

  const cookieOptions = {
    expires: new Date(
      Date.now() +
        Number(process.env.JWT_COOKIE_EXPIRES_IN) * 24 * 60 * 60 * 1000
    ),
    httpOnly: true,
    secure: req.secure || req.headers['x-forwarded-proto'] === 'https'
  };

  res.cookie('jwt', token, cookieOptions);

  // Remove password from the output
  user.password = undefined;

  res.status(statusCode).json({
    status: 'success',
    token,
    data: {
      user
    }
  });
};

export const signup = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const newUser = await User.create(req.body);
    const url = `${req.protocol}://${req.get('host')}/me`;
    await new Email(newUser, url).sendWelcome();
    createSendToken(newUser, 201, req, res);
  }
);

export const login = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    const { email, password } = req.body;

    // 1. Check if email and password exist
    if (!email || !password) {
      return next(new AppError('Please provide email and password', 400));
    }
    // 2. Check if user exists and password is correct
    const user = await User.findOne({ email }).select('+password');

    if (!user || !(await user.correctPassword(password, user.password!))) {
      return next(new AppError('Incorrect email or password', 401));
    }

    // 3. If ok, send token to client
    createSendToken(user, 200, req, res);
  }
);

export const logout = (req: Request, res: Response, next: NextFunction) => {
  res.cookie('jwt', 'loggedout', {
    expires: new Date(Date.now() + 10 * 1000),
    httpOnly: true
  });
  res.status(200).json({ status: 'success' });
};

export const protect = catchAsync(async (req: Request, res, next) => {
  // 1. Get token and check if it is there
  let token;
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies.jwt) {
    token = req.cookies.jwt;
  }

  if (!token) {
    return next(
      new AppError('You are not logged in. Please log in to get access.', 401)
    );
  }
  // 2. Verification token
  const decoded: any = await promisify(jwt.verify)(
    token,
    process.env.JWT_SECRET!
  );

  // 3. Check if user still exists
  const currentUser = await User.findById(decoded.id);
  if (!currentUser) {
    return next(new AppError('The user no longer exists.', 401));
  }

  // 4. Check if user changed password after token was issued
  if (currentUser.changedPasswordAfter(decoded.iat)) {
    return next(
      new AppError('User recently changed password. Please log in again.', 401)
    );
  }

  // Grant access to protected route
  req.user = currentUser;
  res.locals.user = currentUser;

  next();
});

// Only for rendered pages, no errors
export const isLoggedIn = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    if (req.cookies.jwt) {
      // 1. Verify token
      const decoded: any = await promisify(jwt.verify)(
        req.cookies.jwt,
        process.env.JWT_SECRET!
      );

      // 2. Check if user still exists
      // 3. Check if user changed password after token was issued
      const currentUser = await User.findById(decoded.id);
      if (!currentUser || currentUser.changedPasswordAfter(decoded.iat)) {
        return next(
          new AppError('You are no longer logged in. Please log in again.', 401)
        );
      }

      // There is a logged in user
      res.status(200).json({
        status: 'success',
        data: {
          user: currentUser
        }
      });
    } else {
      return next(
        new AppError('You are no longer logged in. Please log in again.', 401)
      );
    }
  }
);

export const restrictTo = (...roles: TUserRoles[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    // Roles is an array ['admin','lead-guide']
    if (!roles.includes(req.user.role)) {
      return next(
        new AppError('You do not have permission to perform this action', 403)
      );
    }

    next();
  };
};

export const forgotPassword = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    // 1. Get user on posted email
    const user = await User.findOne({ email: req.body.email });
    if (!user) {
      return next(
        new AppError('There is no user with this email address', 404)
      );
    }
    // 2. Generate random token
    const resetToken = user.createPasswordResetToken();
    await user.save({ validateBeforeSave: false });

    try {
      // 3. Send it to user's email
      const resetURL = `${req.protocol}://${req.get(
        'host'
      )}/api/v1/users/resetpassword/${resetToken}`;

      await new Email(user, resetURL).sendPasswordReset();

      res.status(200).json({
        status: 'success',
        message: 'Token sent to email'
      });
    } catch (err) {
      user.passwordResetToken = undefined;
      user.passwordResetExpires = undefined;
      await user.save({ validateBeforeSave: false });
      return next(
        new AppError('There was an error sending email. Try again later.', 500)
      );
    }
  }
);

export const resetPassword = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    // 1. Get user based on token
    const hashedToken = crypto
      .createHash('sha256')
      .update(req.params.token)
      .digest('hex');

    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() }
    });

    // 2. If token not expired and user exists, set new password
    if (!user) {
      return next(new AppError('Token is invalid or has expired', 400));
    }

    user.password = req.body.password;
    user.passwordConfirm = req.body.passwordConfirm;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;

    await user.save();

    // 3. Update changedPasswordAt property for the user in the data model

    // 4. Log user in, send JWT
    createSendToken(user, 200, req, res);
  }
);

export const updatePassword = catchAsync(
  async (req: Request, res: Response, next: NextFunction) => {
    // 1. Get user from collection
    const user = await User.findById(req.user.id).select('+password');

    if (!user) {
      return next(new AppError('User does not exist.', 404));
    }

    // 2. Check if posted password is correct
    if (
      !(await user.correctPassword(req.body.passwordCurrent, user.password!))
    ) {
      return next(new AppError('Your current password is incorrect.', 401));
    }
    // 3. Update the password
    user.password = req.body.password;
    user.passwordConfirm = req.body.passwordConfirm;
    await user.save();
    // 4. Log user in, send JWT
    createSendToken(user, 200, req, res);
  }
);
