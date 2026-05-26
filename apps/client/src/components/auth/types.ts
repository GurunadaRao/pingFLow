export type AuthMode = "signin" | "signup";
export type AuthTheme = "light" | "dark";

export interface AuthContent {
  image: {
    src: string;
    alt: string;
  };
  quote: {
    text: string;
    author: string;
  };
}

export interface SignInFormData {
  email: string;
  password: string;
}

export interface SignUpFormData {
  name: string;
  email: string;
  password: string;
}