'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAppStore } from '@/lib/store';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableHead,
  TableHeader,
  TableRow,
  TableBody,
  TableCell,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { fmtDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import {
  Newspaper,
  Plus,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
  Loader2,
  FileText,
  CheckCircle2,
  Clock,
  ExternalLink,
  Search,
} from 'lucide-react';
import { authFetch } from '@/lib/auth-client';

interface BlogPost {
  id: string;
  title: string;
  slug: string;
  body: string;
  image: string | null;
  categoryId: string | null;
  authorId: string | null;
  views: number;
  status: string;
  createdAt: string;
  updatedAt: string;
  category: { id: string; name: string; slug: string } | null;
  author: {
    id: string;
    firstName: string;
    lastName: string;
    username: string;
    email: string;
    role: string;
  } | null;
}

interface Category {
  id: string;
  name: string;
  slug: string;
}

interface Stats {
  total: number;
  published: number;
  drafts: number;
}

const EMPTY_FORM = {
  title: '',
  slug: '',
  body: '',
  image: '',
  categoryId: '',
  status: 'draft' as 'draft' | 'published',
};

export function BlogManagerView() {
  const { currentAdmin } = useAppStore();
  const { toast } = useToast();

  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Editor dialog
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<typeof EMPTY_FORM>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<BlogPost | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Publish/unpublish in-flight id
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const loadPosts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch('/api/admin/blog?limit=100');
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load posts');
      setPosts(json.posts || []);
    } catch (e: any) {
      toast({
        title: 'Error',
        description: e.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const loadCategories = useCallback(async () => {
    try {
      const res = await authFetch('/api/admin/blog/categories');
      const json = await res.json();
      if (res.ok) setCategories(json.categories || []);
    } catch {
      // ignore — categories are optional
    }
  }, []);

  useEffect(() => {
    loadPosts();
    loadCategories();
  }, [loadPosts, loadCategories]);

  const stats: Stats = useMemo(
    () => ({
      total: posts.length,
      published: posts.filter((p) => p.status === 'published').length,
      drafts: posts.filter((p) => p.status === 'draft').length,
    }),
    [posts]
  );

  const filtered = useMemo(() => {
    let list = posts;
    if (statusFilter !== 'all') {
      list = list.filter((p) => p.status === statusFilter);
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          p.slug.toLowerCase().includes(q) ||
          p.author?.firstName?.toLowerCase().includes(q) ||
          p.author?.lastName?.toLowerCase().includes(q) ||
          p.author?.username?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [posts, statusFilter, search]);

  // ── Editor handlers ────────────────────────────────────────────────────
  const openNew = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setEditorOpen(true);
  };

  const openEdit = (p: BlogPost) => {
    setForm({
      title: p.title,
      slug: p.slug,
      body: p.body,
      image: p.image || '',
      categoryId: p.categoryId || '',
      status: (p.status as 'draft' | 'published') || 'draft',
    });
    setEditingId(p.id);
    setEditorOpen(true);
  };

  const submit = async () => {
    if (!form.title.trim() || !form.body.trim()) {
      toast({
        title: 'Missing fields',
        description: 'Title and body are required.',
        variant: 'destructive',
      });
      return;
    }
    setSaving(true);
    try {
      const payload: any = {
        adminId: currentAdmin?.id,
        title: form.title.trim(),
        slug: form.slug.trim(),
        body: form.body,
        image: form.image.trim() || null,
        categoryId: form.categoryId || null,
        status: form.status,
      };

      let res: Response;
      if (editingId) {
        res = await authFetch(`/api/admin/blog/${editingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        res = await authFetch('/api/admin/blog', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Save failed');

      toast({
        title: editingId ? 'Post updated' : 'Post created',
        description: `“${form.title.trim()}” has been ${
          editingId ? 'updated' : 'created'
        }.`,
      });
      setEditorOpen(false);
      setForm(EMPTY_FORM);
      setEditingId(null);
      loadPosts();
    } catch (e: any) {
      toast({
        title: 'Error',
        description: e.message,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  // ── Delete handlers ────────────────────────────────────────────────────
  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await authFetch(`/api/admin/blog/${deleteTarget.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminId: currentAdmin?.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Delete failed');
      toast({
        title: 'Post deleted',
        description: `“${deleteTarget.title}” has been removed.`,
      });
      setDeleteTarget(null);
      loadPosts();
    } catch (e: any) {
      toast({
        title: 'Error',
        description: e.message,
        variant: 'destructive',
      });
    } finally {
      setDeleting(false);
    }
  };

  // ── Publish / Unpublish ───────────────────────────────────────────────
  const togglePublish = async (p: BlogPost) => {
    setTogglingId(p.id);
    try {
      if (p.status === 'published') {
        // Unpublish — PUT back to draft
        const res = await authFetch(`/api/admin/blog/${p.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            adminId: currentAdmin?.id,
            status: 'draft',
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Unpublish failed');
        toast({
          title: 'Unpublished',
          description: `“${p.title}” is now a draft.`,
        });
      } else {
        // Publish — use the dedicated publish endpoint
        const res = await authFetch(`/api/admin/blog/${p.id}/publish`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ adminId: currentAdmin?.id }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Publish failed');
        toast({
          title: 'Published',
          description: `“${p.title}” is now live.`,
        });
      }
      loadPosts();
    } catch (e: any) {
      toast({
        title: 'Error',
        description: e.message,
        variant: 'destructive',
      });
    } finally {
      setTogglingId(null);
    }
  };

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-full space-y-5">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Newspaper className="h-5 w-5 text-emerald-600" /> Blog Manager
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Create, edit and publish blog posts for the public marketing site.
          </p>
        </div>
        <Button onClick={openNew} className="bg-emerald-600 hover:bg-emerald-700">
          <Plus className="h-4 w-4 mr-1.5" />
          New Post
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatCard
          label="Total Posts"
          value={stats.total}
          icon={FileText}
          tone="slate"
        />
        <StatCard
          label="Published"
          value={stats.published}
          icon={CheckCircle2}
          tone="emerald"
        />
        <StatCard
          label="Drafts"
          value={stats.drafts}
          icon={Clock}
          tone="amber"
        />
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by title, slug or author..."
                className="pl-9"
              />
            </div>
            <Select
              value={statusFilter}
              onValueChange={setStatusFilter}
            >
              <SelectTrigger className="w-full md:w-48">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="published">Published</SelectItem>
                <SelectItem value="draft">Drafts</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-slate-50">
                <TableHead className="text-[11px] uppercase tracking-wider text-slate-500">
                  Title
                </TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider text-slate-500">
                  Category
                </TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider text-slate-500">
                  Author
                </TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider text-slate-500">
                  Status
                </TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider text-slate-500 text-right">
                  Views
                </TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider text-slate-500">
                  Created
                </TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider text-slate-500 text-right">
                  Actions
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-10">
                    <Loader2 className="h-5 w-5 animate-spin text-slate-400 mx-auto" />
                    <p className="text-xs text-slate-500 mt-2">Loading posts…</p>
                  </TableCell>
                </TableRow>
              ) : filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-10">
                    <FileText className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                    <p className="text-sm font-medium text-slate-700">
                      No posts yet
                    </p>
                    <p className="text-xs text-slate-500 mt-1">
                      Click “New Post” to create your first blog entry.
                    </p>
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((p) => (
                  <TableRow key={p.id} className="hover:bg-slate-50">
                    <TableCell className="max-w-[280px]">
                      <div className="flex items-center gap-2 min-w-0">
                        {p.image ? (
                          <img
                            src={p.image}
                            alt=""
                            className="h-9 w-9 rounded-md object-cover shrink-0 border border-slate-200"
                          />
                        ) : (
                          <div className="h-9 w-9 rounded-md bg-emerald-50 flex items-center justify-center shrink-0">
                            <FileText className="h-4 w-4 text-emerald-600" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-900 truncate">
                            {p.title}
                          </p>
                          <p className="text-[11px] text-slate-500 truncate font-mono">
                            /{p.slug}
                          </p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      {p.category ? (
                        <Badge
                          variant="outline"
                          className="border-slate-200 text-slate-700"
                        >
                          {p.category.name}
                        </Badge>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {p.author ? (
                        <div className="text-xs">
                          <p className="font-medium text-slate-800">
                            {p.author.firstName} {p.author.lastName}
                          </p>
                          <p className="text-slate-500">@{p.author.username}</p>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={cn(
                          'border-transparent',
                          p.status === 'published'
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-amber-100 text-amber-700'
                        )}
                      >
                        {p.status === 'published' ? 'Published' : 'Draft'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {(p.views || 0).toLocaleString('en-NG')}
                    </TableCell>
                    <TableCell className="text-xs text-slate-600">
                      {fmtDate(p.createdAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0"
                          onClick={() => openEdit(p)}
                          aria-label="Edit"
                          title="Edit"
                        >
                          <Pencil className="h-4 w-4 text-slate-600" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0"
                          onClick={() => togglePublish(p)}
                          disabled={togglingId === p.id}
                          aria-label={
                            p.status === 'published'
                              ? 'Unpublish'
                              : 'Publish'
                          }
                          title={
                            p.status === 'published'
                              ? 'Unpublish'
                              : 'Publish'
                          }
                        >
                          {togglingId === p.id ? (
                            <Loader2 className="h-4 w-4 animate-spin text-slate-500" />
                          ) : p.status === 'published' ? (
                            <EyeOff className="h-4 w-4 text-amber-600" />
                          ) : (
                            <Eye className="h-4 w-4 text-emerald-600" />
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0 hover:bg-red-50"
                          onClick={() => setDeleteTarget(p)}
                          aria-label="Delete"
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Editor dialog */}
      <Dialog open={editorOpen} onOpenChange={setEditorOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Newspaper className="h-5 w-5 text-emerald-600" />
              {editingId ? 'Edit Post' : 'New Post'}
            </DialogTitle>
            <DialogDescription>
              {editingId
                ? 'Update the post details below. Changes are audit-logged.'
                : 'Create a new blog post. You can save as a draft and publish later.'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-2">
            {/* Title */}
            <div className="grid gap-1.5">
              <Label htmlFor="bp-title">
                Title <span className="text-red-500">*</span>
              </Label>
              <Input
                id="bp-title"
                value={form.title}
                onChange={(e) =>
                  setForm((f) => ({ ...f, title: e.target.value }))
                }
                placeholder="e.g. How SMEs Can Access ₦5M Working Capital"
              />
            </div>

            {/* Slug + Status */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="bp-slug">
                  Slug{' '}
                  <span className="text-[11px] font-normal text-slate-400">
                    (auto-generated if blank)
                  </span>
                </Label>
                <Input
                  id="bp-slug"
                  value={form.slug}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, slug: e.target.value }))
                  }
                  placeholder="sme-working-capital"
                  className="font-mono text-sm"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="bp-status">Status</Label>
                <Select
                  value={form.status}
                  onValueChange={(v) =>
                    setForm((f) => ({
                      ...f,
                      status: v as 'draft' | 'published',
                    }))
                  }
                >
                  <SelectTrigger id="bp-status">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="published">Published</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Category + Image */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="bp-cat">Category</Label>
                <Select
                  value={form.categoryId}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, categoryId: v }))
                  }
                >
                  <SelectTrigger id="bp-cat">
                    <SelectValue placeholder="Uncategorised" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">Uncategorised</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="bp-image">Featured image URL</Label>
                <Input
                  id="bp-image"
                  value={form.image}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, image: e.target.value }))
                  }
                  placeholder="https://…/cover.jpg"
                />
              </div>
            </div>

            {/* Body */}
            <div className="grid gap-1.5">
              <Label htmlFor="bp-body">
                Body <span className="text-red-500">*</span>{' '}
                <span className="text-[11px] font-normal text-slate-400">
                  (HTML supported)
                </span>
              </Label>
              <Textarea
                id="bp-body"
                value={form.body}
                onChange={(e) =>
                  setForm((f) => ({ ...f, body: e.target.value }))
                }
                rows={12}
                placeholder="Write your post content here…"
                className="font-mono text-sm"
              />
              <p className="text-[11px] text-slate-500">
                {form.body.length.toLocaleString('en-NG')} characters
              </p>
            </div>

            {/* Image preview */}
            {form.image && (
              <div className="rounded-lg border border-slate-200 overflow-hidden">
                <img
                  src={form.image}
                  alt="Featured preview"
                  className="h-40 w-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditorOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              onClick={submit}
              disabled={saving}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  Saving…
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-1.5" />
                  {editingId ? 'Save changes' : 'Create post'}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="h-4 w-4 text-red-600" />
              Delete blog post?
            </AlertDialogTitle>
            <AlertDialogDescription>
              You are about to permanently delete{' '}
              <span className="font-semibold text-slate-900">
                “{deleteTarget?.title}”
              </span>
              . This action cannot be undone and will be recorded in the audit
              trail.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {deleting ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 mr-1.5" />
              )}
              Delete post
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* View-on-site footer link */}
      <div className="text-center pt-2">
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            useAppStore.getState().setView('public-blog');
          }}
          className="inline-flex items-center gap-1.5 text-xs text-emerald-700 hover:text-emerald-800 font-medium"
        >
          View public blog
          <ExternalLink className="h-3.5 w-3.5" />
        </a>
      </div>
    </div>
  );
}

// ── Small stat card ─────────────────────────────────────────────────────────
function StatCard({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  tone: 'slate' | 'emerald' | 'amber';
}) {
  const toneClasses = {
    slate: 'bg-slate-50 text-slate-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
  }[tone];
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div
          className={cn(
            'flex h-10 w-10 items-center justify-center rounded-lg',
            toneClasses
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wider text-slate-500">
            {label}
          </p>
          <p className="text-xl font-bold text-slate-900 tabular-nums">
            {value.toLocaleString('en-NG')}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
