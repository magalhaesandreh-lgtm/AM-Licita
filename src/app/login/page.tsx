'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useAuth, useFirestore } from '@/firebase';
import {
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  createUserWithEmailAndPassword,
} from 'firebase/auth';
import { doc, setDoc, serverTimestamp, getDocs, collection, query, limit, updateDoc } from 'firebase/firestore';
import { useBranding } from '@/hooks/use-branding';
import { BrandLogo } from '@/components/brand-logo';

const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .email('E-mail inválido.'),
  password: z
    .string()
    .min(6, 'A senha deve ter no mínimo 6 caracteres.'),
});

type FormValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const { toast } = useToast();
  const firestore = useFirestore();
  const auth = useAuth();
  const router = useRouter();
  const branding = useBranding();

  const [showPassword, setShowPassword] = React.useState(false);
  const [mode, setMode] = React.useState<'login' | 'signup' | 'reset'>('login');
  const [isLoading, setIsLoading] = React.useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(loginSchema),
    mode: 'onSubmit',
    reValidateMode: 'onChange',
    defaultValues: { email: '', password: '' },
  });
  
  const onSubmit = async (data: FormValues) => {
    if (!auth || !firestore) return;
    setIsLoading(true);
    try {
      if (mode === 'login') {
        await signInWithEmailAndPassword(auth, data.email, data.password);
        toast({ title: 'Login realizado com sucesso!' });
        router.push('/dashboard');
      } else if (mode === 'signup') {
        // The profile creation is now handled by the FirebaseProvider for robustness.
        // This only creates the auth user.
        await createUserWithEmailAndPassword(auth, data.email, data.password);
        toast({ title: 'Conta criada com sucesso!' });
        router.push('/dashboard');
      }
    } catch (error: any) {
      console.error(error);
      const errorCode = error.code;
      let message = 'Ocorreu um erro. Tente novamente.';
      if (errorCode === 'auth/user-not-found' || errorCode === 'auth/wrong-password' || errorCode === 'auth/invalid-credential') {
        message = 'E-mail ou senha incorretos.';
      } else if (errorCode === 'auth/email-already-in-use') {
        message = 'Este e-mail já está em uso.';
      }
      toast({ variant: 'destructive', title: 'Erro', description: message });
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!auth) return;
    const email = form.getValues('email');
    if (!email) {
      form.setError('email', {
        type: 'manual',
        message: 'Por favor, insira seu e-mail para redefinir a senha.',
      });
      return;
    }
    const emailValidation = z.string().email().safeParse(email);
    if (!emailValidation.success) {
        toast({ variant: 'destructive', title: 'E-mail inválido', description: 'Por favor, insira um e-mail válido.' });
        return;
    }

    setIsLoading(true);
    try {
      await sendPasswordResetEmail(auth, email);
      toast({
        title: 'E-mail de redefinição enviado!',
        description: 'Verifique sua caixa de entrada.',
      });
      setMode('login');
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Erro',
        description: 'Não foi possível enviar o e-mail de redefinição.',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getTitle = () => {
    switch (mode) {
      case 'signup':
        return 'Criar Conta';
      case 'reset':
        return 'Redefinir Senha';
      default:
        return 'Login';
    }
  };

  const getDescription = () => {
     switch (mode) {
      case 'signup':
        return 'Crie uma nova conta para acessar o sistema.';
      case 'reset':
        return 'Insira seu e-mail para receber o link de redefinição.';
      default:
        return `Bem-vindo ao ${branding.appName}. Entre para continuar.`;
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="mx-auto w-full max-w-sm">
        <CardHeader className="items-center text-center">
            <BrandLogo className="h-24 w-24 mb-4" variant="login" />
          <CardTitle className="text-2xl font-bold text-primary">{getTitle()}</CardTitle>
          <CardDescription>{getDescription()}</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="seu@email.com"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {mode !== 'reset' && (
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Senha</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Input
                            type={showPassword ? 'text' : 'password'}
                            {...field}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 text-muted-foreground"
                            onClick={() => setShowPassword(!showPassword)}
                          >
                            {showPassword ? <EyeOff /> : <Eye />}
                          </Button>
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {mode === 'login' && (
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading && <Loader2 className="mr-2 animate-spin" />}
                  Entrar
                </Button>
              )}
              {mode === 'signup' && (
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading && <Loader2 className="mr-2 animate-spin" />}
                  Criar Conta
                </Button>
              )}
              {mode === 'reset' && (
                <Button
                  type="button"
                  className="w-full"
                  onClick={handlePasswordReset}
                  disabled={isLoading}
                >
                  {isLoading && <Loader2 className="mr-2 animate-spin" />}
                  Enviar Link
                </Button>
              )}
            </form>
          </Form>

          <div className="mt-4 text-center text-sm">
            {mode === 'login' && (
              <>
                Não tem uma conta?{' '}
                <Button variant="link" onClick={() => setMode('signup')} className="p-0">
                  Crie agora
                </Button>
              </>
            )}
             {mode === 'signup' && (
              <>
                Já tem uma conta?{' '}
                <Button variant="link" onClick={() => setMode('login')} className="p-0">
                  Faça login
                </Button>
              </>
            )}
             {(mode === 'login' || mode === 'signup') && (
                <p>
                    <Button variant="link" onClick={() => setMode('reset')} className="p-0 text-xs">
                        Esqueceu sua senha?
                    </Button>
                </p>
             )}
            {mode === 'reset' && (
              <Button variant="link" onClick={() => setMode('login')} className="p-0">
                Voltar para o login
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
