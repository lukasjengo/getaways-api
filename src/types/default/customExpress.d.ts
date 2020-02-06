declare namespace Express {
  export interface Request {
    user: {
      id: string;
    };
    files: {
      [fieldname: string]: Express.Multer.File[];
    };
  }
}
