'use client';

import * as React from 'react';
import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  User as UserIcon,
  Building,
  AtSign,
  Phone,
  Briefcase,
  MapPin,
  Camera,
  Loader2,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { ThemeToggle } from '@/components/theme-toggle';
import { useFirestore, useUser, useStorage } from '@/firebase';
import { doc, updateDoc } from 'firebase/firestore';
import { uploadFileToStorage } from '@/firebase/storage';
import { UserProfileAvatar } from '@/components/user-profile-avatar';

const profileSchema = z.object({
  nome: z.string().min(1, 'O nome completo é obrigatório.'),
  displayName: z.string().optional(),
  email: z.string().email('E-mail inválido.').optional().or(z.literal('')),
  telefone: z.string().optional(),
  cargo: z.string().optional(),
  companyName: z.string().optional(),
  location: z.string().optional(),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

export default function PerfilPage() {
  const { toast } = useToast();
  const { user, profile, isUserLoading } = useUser();
  const firestore = useFirestore();
  const storage = useStorage();
  const [isSaving, setIsSaving] = React.useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  
  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      nome: '',
      displayName: '',
      email: '',
      telefone: '',
      cargo: '',
      companyName: 'AM Gestão de Licitações',
      location: '',
    },
  });

  React.useEffect(() => {
    if (profile) {
      form.reset({
        nome: profile.nome || '',
        displayName: profile.displayName || '',
        email: profile.email || '',
        telefone: profile.telefone || '',
        cargo: profile.cargo || '',
        companyName: profile.companyName || 'AM Gestão de Licitações',
        location: profile.location || '',
      });
    }
  }, [profile, form]);

  const watchedFullName = form.watch('nome');
  const watchedDisplayName = form.watch('displayName');

  const onSubmit = async (values: ProfileFormValues) => {
    if (!user || !firestore) {
      toast({ variant: 'destructive', title: 'Erro de Conexão', description: 'Não foi possível conectar aos serviços do Firebase.' });
      return;
    }
    
    setIsSaving(true);
    try {
      const profileRef = doc(firestore, 'profiles', user.uid);
      
      const dataToUpdate = {
        ...values,
        updatedAt: new Date().toISOString(),
      };

      await updateDoc(profileRef, dataToUpdate);

      toast({
        title: 'Perfil salvo!',
        description: 'Suas informações foram atualizadas.',
      });
    } catch (error: any) {
      console.error('Error updating profile: ', error);
      let description = 'Não foi possível salvar o perfil.';
      if(error.code) {
        description += ` Código: ${error.code}.`;
      }
      toast({
        variant: 'destructive',
        title: 'Erro ao salvar',
        description: description,
        duration: 9000,
      });
    } finally {
        setIsSaving(false);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user || !firestore || !storage) return;

    if (!file.type.startsWith('image/')) {
      toast({ variant: 'destructive', title: 'Arquivo inválido', description: 'Por favor, selecione uma imagem.' });
      return;
    }

    setIsUploadingPhoto(true);
    try {
      const path = `profiles/${user.uid}/avatar_${Date.now()}`;
      const url = await uploadFileToStorage(storage, path, file);
      
      const profileRef = doc(firestore, 'profiles', user.uid);
      await updateDoc(profileRef, { photoURL: url, updatedAt: new Date().toISOString() });
      
      toast({ title: 'Foto atualizada!', description: 'Sua foto de perfil foi atualizada com sucesso.' });
    } catch (error) {
      console.error('Error uploading photo', error);
      toast({ variant: 'destructive', title: 'Erro', description: 'Não foi possível fazer o upload da foto.' });
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  if (isUserLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Meu Perfil</CardTitle>
            <CardDescription>
              Gerencie suas informações pessoais, de contato e preferências.
            </CardDescription>
          </CardHeader>
        </Card>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Coluna do Avatar */}
          <div className="lg:col-span-1">
            <Card>
              <CardHeader className="items-center text-center">
                <div className="relative group">
                  <UserProfileAvatar className="h-32 w-32" />
                  <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/60 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="text-white hover:bg-white/20 hover:text-white"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={isUploadingPhoto}
                    >
                      {isUploadingPhoto ? <Loader2 className="h-6 w-6 animate-spin" /> : <Camera className="h-6 w-6" />}
                      <span className="sr-only">Upload de foto</span>
                    </Button>
                    <input 
                      type="file" 
                      className="hidden" 
                      ref={fileInputRef} 
                      accept="image/*" 
                      onChange={handlePhotoUpload} 
                    />
                  </div>
                </div>
                <CardTitle className="mt-4">
                  {watchedDisplayName || watchedFullName || 'Usuário'}
                </CardTitle>
                <CardDescription>
                  {form.getValues('cargo') || 'Função não definida'}
                </CardDescription>
              </CardHeader>
            </Card>
          </div>

          {/* Coluna dos Formulários */}
          <div className="space-y-6 lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>Identificação</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="nome"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nome Completo</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <UserIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          <Input {...field} className="pl-9" />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="displayName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nome de Exibição</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <UserIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            {...field}
                            className="pl-9"
                            placeholder="Como você quer ser chamado?"
                            value={field.value ?? ''}
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Contato e Empresa</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>E-mail</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <AtSign className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input type="email" {...field} className="pl-9" disabled />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="telefone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Telefone/WhatsApp</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input {...field} className="pl-9" value={field.value ?? ''} />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="companyName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nome da Empresa</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <Building className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          <Input {...field} className="pl-9" value={field.value ?? ''} />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="cargo"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Cargo/Função</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Briefcase className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input {...field} className="pl-9" value={field.value ?? ''} />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="location"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Cidade/UF</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <MapPin className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input {...field} className="pl-9" value={field.value ?? ''} />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Preferências</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <p className="text-sm font-medium">Tema Visual</p>
                  <ThemeToggle />
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button
            type="submit"
            disabled={isSaving || !form.formState.isDirty}
          >
            {isSaving && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Salvar Alterações
          </Button>
        </div>
      </form>
    </Form>
  );
}
