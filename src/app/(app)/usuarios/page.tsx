'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { MoreHorizontal, PlusCircle } from 'lucide-react';
import {
  collection,
  doc,
  updateDoc,
} from 'firebase/firestore';

import { useFirestore, useCollection, useMemoFirebase } from '@/firebase';
import type { Profile } from '@/lib/models';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DataTable, type ColumnDef } from '@/components/data-table';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

const profileSchema = z.object({
  nome: z.string().min(1, 'O nome é obrigatório.'),
  email: z.string().email('E-mail inválido'),
  cargo: z.string().optional(),
  role: z.enum(['admin', 'user']),
  ativo: z.boolean(),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

export default function UsuariosPage() {
  const firestore = useFirestore();

  const profilesQuery = useMemoFirebase(() => {
    if (!firestore) {
      return null;
    }
    return collection(firestore, 'profiles');
  }, [firestore]);
  
  const {
    data: profiles,
    isLoading,
    error,
  } = useCollection<Profile>(profilesQuery);
  const { toast } = useToast();

  const [isFormOpen, setIsFormOpen] = React.useState(false);
  const [editingProfile, setEditingProfile] = React.useState<Profile | null>(
    null
  );

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
  });

  const handleEdit = (profile: Profile) => {
    setEditingProfile(profile);
    form.reset({
      nome: profile.nome,
      email: profile.email,
      cargo: profile.cargo,
      role: profile.role,
      ativo: profile.ativo,
    });
    setIsFormOpen(true);
  };

  const onSubmit = async (values: ProfileFormValues) => {
    if (!editingProfile || !firestore) return;

    try {
      const profileRef = doc(firestore, 'profiles', editingProfile.uid);
      await updateDoc(profileRef, {
        ...values,
        updatedAt: new Date().toISOString(),
      });
      toast({ title: 'Usuário atualizado com sucesso!' });
      setIsFormOpen(false);
    } catch (e) {
      toast({
        title: 'Erro ao atualizar usuário',
        variant: 'destructive',
      });
    }
  };

  const columns: ColumnDef<Profile>[] = React.useMemo(
    () => [
      {
        accessorKey: 'nome',
        header: 'Nome',
        cell: (row) => (
          <div className="flex items-center gap-3">
            <Avatar>
              <AvatarFallback>
                {row.nome
                  .split(' ')
                  .map((n) => n[0])
                  .join('')}
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col">
              <span className="font-medium">{row.nome}</span>
              <span className="text-sm text-muted-foreground">{row.email}</span>
            </div>
          </div>
        ),
      },
      { accessorKey: 'cargo', header: 'Cargo', cell: (row) => row.cargo || '-' },
      {
        accessorKey: 'role',
        header: 'Role',
        cell: (row) => (
          <Badge variant={row.role === 'admin' ? 'default' : 'secondary'}>
            {row.role}
          </Badge>
        ),
      },
      {
        accessorKey: 'ativo',
        header: 'Status',
        cell: (row) => (
          <Badge variant={row.ativo ? 'default' : 'outline'}>
            {row.ativo ? 'Ativo' : 'Inativo'}
          </Badge>
        ),
      },
      {
        accessorKey: 'actions',
        header: 'Ações',
        align: 'right',
        cell: (row) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0">
                <span className="sr-only">Abrir menu</span>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Ações</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => handleEdit(row)}>
                Editar Perfil
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    []
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle>Gerenciamento de Usuários</CardTitle>
              <CardDescription>
                Visualize e gerencie os usuários do sistema.
              </CardDescription>
            </div>
            {/* O botão de "Novo Usuário" pode ser implementado no futuro com um fluxo de convite */}
            {/* <Button><PlusCircle className="mr-2 h-4 w-4" /> Novo Usuário</Button> */}
          </div>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={profiles || []}
            isLoading={isLoading}
            emptyStateMessage="Nenhum usuário encontrado."
          />
        </CardContent>
      </Card>

      <Dialog open={isFormOpen} onOpenChange={setIsFormOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Perfil</DialogTitle>
            <DialogDescription>
              Altere as informações do usuário.
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form
              id="edit-profile-form"
              onSubmit={form.handleSubmit(onSubmit)}
              className="space-y-4"
            >
              <FormField
                control={form.control}
                name="nome"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome Completo</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>E-mail</FormLabel>
                    <FormControl>
                      <Input {...field} disabled />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="cargo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cargo</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value || ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Role</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione a role" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="user">User</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="ativo"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-3">
                    <Label>Status Ativo</Label>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </form>
          </Form>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsFormOpen(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" form="edit-profile-form">
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
