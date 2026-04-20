/**
 * Login Page - Authentication interface for SMT Verification System
 */

import { useState, FormEvent } from "react";
import { AlertCircle, LogIn } from "lucide-react";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Card } from "../ui/card";
import { Alert, AlertDescription } from "../ui/alert";

interface LoginProps {
  onLogin?: (user: { id: string; email: string; name: string }) => void;
}

export default function Login({ onLogin }: LoginProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      // Validate inputs
      if (!email || !password) {
        setError("Please enter both email and password");
        return;
      }

      if (!email.includes("@")) {
        setError("Please enter a valid email address");
        return;
      }

      // Simulate login delay
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Create user object
      const user = {
        id: "user-" + Math.random().toString(36).substr(2, 9),
        email,
        name: email.split("@")[0],
      };

      // Call the onLogin callback if provided
      if (onLogin) {
        onLogin(user);
      }
    } catch (err) {
      setError("Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-xl border-0">
        <div className="p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-indigo-100 rounded-lg mb-4">
              <LogIn className="w-8 h-8 text-indigo-600" />
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">
              SMT Verification
            </h1>
            <p className="text-gray-600 text-sm">
              Analytics & Reporting Dashboard
            </p>
          </div>

          {/* Error Alert */}
          {error && (
            <Alert className="mb-6 border-red-200 bg-red-50">
              <AlertCircle className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-red-800">
                {error}
              </AlertDescription>
            </Alert>
          )}

          {/* Login Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email Input */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                Email Address
              </label>
              <Input
                id="email"
                type="email"
                placeholder="your@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                className="w-full"
              />
              <p className="text-xs text-gray-500 mt-1">
                Try: qa@example.com or engineer@example.com
              </p>
            </div>

            {/* Password Input */}
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                Password
              </label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                className="w-full"
              />
              <p className="text-xs text-gray-500 mt-1">
                For demo: any password works
              </p>
            </div>

            {/* Submit Button */}
            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 rounded-lg transition-colors mt-6"
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Logging in...
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <LogIn className="w-4 h-4" />
                  Login
                </span>
              )}
            </Button>
          </form>

          {/* Demo Credentials Info */}
          <div className="mt-8 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <h3 className="text-sm font-semibold text-blue-900 mb-2">
              Demo Credentials
            </h3>
            <ul className="text-xs text-blue-800 space-y-1">
              <li>• <strong>Email:</strong> qa@example.com</li>
              <li>• <strong>Email:</strong> engineer@example.com</li>
              <li>• <strong>Password:</strong> any value (demo mode)</li>
            </ul>
          </div>

          {/* Footer */}
          <p className="text-center text-xs text-gray-500 mt-6">
            SMT Verification System © 2026
          </p>
        </div>
      </Card>
    </div>
  );
}
