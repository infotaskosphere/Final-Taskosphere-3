import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';
import { LogIn } from 'lucide-react';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async () => {
    if (!email || !password) {
      toast.error('Please enter email and password');
      return;
    }
    
    setLoading(true);

    try {
      const response = await axios.post(`${API}/auth/login`, { email, password });
      const { access_token, user } = response.data;
      
      localStorage.setItem('token', access_token);
      localStorage.setItem('user', JSON.stringify(user));
      axios.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;
      
      toast.success('Welcome back!');
      window.location.href = '/dashboard';
    } catch (error) {
      console.error('Login error:', error);
      toast.error(error.response?.data?.detail || 'Invalid email or password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left Side - Image */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden">
        <img
          src="https://images.unsplash.com/photo-1767482712469-3cd37684d319?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1MDZ8MHwxfHNlYXJjaHwxfHxhYnN0cmFjdCUyMDNkJTIwZ2VvbWV0cmljJTIwc2hhcGVzJTIwdmlicmFudCUyMGdyYWRpZW50JTIwbWluaW1hbGlzdHxlbnwwfHx8fDE3NzA5MDQ2NjF8MA&ixlib=rb-4.1.0&q=85"
          alt="Abstract background"
          className="object-cover w-full h-full"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-orange-600/90 to-purple-600/90 flex items-center justify-center">
          <div className="text-center text-white px-12">
            <img src="/logo.png" alt="Taskosphere" className="h-24 mx-auto mb-4" />
            <p className="text-xl text-orange-100">Streamline your CA/CS firm's workflow</p>
          </div>
        </div>
      </div>

      {/* Right Side - Login Form */}
      <div className="flex-1 flex items-center justify-center p-8 bg-slate-50">
        <div className="w-full max-w-md">
          <div className="text-center mb-8 lg:hidden">
            <img src="/logo.png" alt="Taskosphere" className="h-16 mx-auto mb-2" />
            <p className="text-slate-600">CA/CS Task Management</p>
          </div>

          <Card className="border-slate-200 shadow-lg">
            <CardHeader className="space-y-1">
              <CardTitle className="text-2xl font-bold font-outfit">Welcome back</CardTitle>
              <CardDescription>Enter your credentials to access your account</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="name@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    data-testid="login-email-input"
                    className="h-11"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    data-testid="login-password-input"
                    className="h-11"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    console.log('Button clicked!');
                    handleSubmit();
                  }}
                  className="w-full bg-orange-600 hover:bg-orange-700 text-white h-11 rounded-full font-medium shadow-lg transition-all disabled:opacity-50"
                  disabled={loading}
                  data-testid="login-submit-btn"
                >
                  {loading ? (
                    'Signing in...'
                  ) : (
                    <>
                      Sign In
                    </>
                  )}
                </button>
              </div>

              <div className="mt-6 text-center text-sm">
                <span className="text-slate-600">Don't have an account? </span>
                <Link to="/register" className="text-orange-600 hover:text-orange-700 font-medium" data-testid="register-link">
                  Register here
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}