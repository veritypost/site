// Ambient props for the admin design system under
// `site/src/components/admin/*`. Components are `.jsx` + JSDoc; TS
// inference through `forwardRef` erases prop types at call sites.
// These declarations restore type info without modifying the
// design-system source.
//
// No top-level imports — this file stays a global script so `declare
// module` works directly against the `@/` alias. Types reference the
// React namespace via its global ambient declarations.

declare module '@/components/admin/Page' {
  export interface PageProps {
    children?: React.ReactNode;
    maxWidth?: number | string;
    style?: React.CSSProperties;
  }
  const Page: React.ComponentType<PageProps>;
  export default Page;
  export interface PageHeaderProps {
    title: React.ReactNode;
    subtitle?: React.ReactNode;
    actions?: React.ReactNode;
    searchSlot?: React.ReactNode;
    backHref?: string;
    backLabel?: string;
    hideBreadcrumb?: boolean;
    style?: React.CSSProperties;
  }
  export const PageHeader: React.ComponentType<PageHeaderProps>;
}

declare module '@/components/admin/PageSection' {
  export interface PageSectionProps {
    title?: React.ReactNode;
    description?: React.ReactNode;
    aside?: React.ReactNode;
    boxed?: boolean;
    divider?: boolean;
    style?: React.CSSProperties;
    children?: React.ReactNode;
  }
  const PageSection: React.ComponentType<PageSectionProps>;
  export default PageSection;
}

declare module '@/components/admin/Button' {
  export interface ButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
    size?: 'sm' | 'md';
    loading?: boolean;
    block?: boolean;
    leftIcon?: React.ReactNode;
    rightIcon?: React.ReactNode;
    children?: React.ReactNode;
    ref?: React.Ref<HTMLButtonElement>;
  }
  const Button: React.ComponentType<ButtonProps>;
  export default Button;
}

declare module '@/components/admin/TextInput' {
  export interface TextInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size' | 'type'> {
    type?: 'text' | 'email' | 'url' | 'search' | 'password' | 'tel';
    error?: boolean;
    size?: 'sm' | 'md';
    leftAddon?: React.ReactNode;
    rightAddon?: React.ReactNode;
    block?: boolean;
    ref?: React.Ref<HTMLInputElement>;
  }
  const TextInput: React.ComponentType<TextInputProps>;
  export default TextInput;
}

declare module '@/components/admin/Textarea' {
  export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
    error?: boolean;
    block?: boolean;
    autoGrow?: boolean;
    ref?: React.Ref<HTMLTextAreaElement>;
  }
  const Textarea: React.ComponentType<TextareaProps>;
  export default Textarea;
}

declare module '@/components/admin/Select' {
  export interface SelectOption {
    value: string;
    label: string;
  }
  export interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
    options?: SelectOption[];
    error?: boolean;
    size?: 'sm' | 'md';
    block?: boolean;
    placeholder?: string;
    ref?: React.Ref<HTMLSelectElement>;
  }
  const Select: React.ComponentType<SelectProps>;
  export default Select;
}

declare module '@/components/admin/NumberInput' {
  export interface NumberInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size' | 'type'> {
    min?: number;
    max?: number;
    step?: number;
    error?: boolean;
    size?: 'sm' | 'md';
    block?: boolean;
    ref?: React.Ref<HTMLInputElement>;
  }
  const NumberInput: React.ComponentType<NumberInputProps>;
  export default NumberInput;
}

declare module '@/components/admin/DatePicker' {
  export interface DatePickerProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size' | 'type'> {
    includeTime?: boolean;
    min?: string;
    max?: string;
    error?: boolean;
    size?: 'sm' | 'md';
    block?: boolean;
    ref?: React.Ref<HTMLInputElement>;
  }
  const DatePicker: React.ComponentType<DatePickerProps>;
  export default DatePicker;
}

declare module '@/components/admin/Checkbox' {
  export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'type'> {
    label?: React.ReactNode;
    hint?: React.ReactNode;
    indeterminate?: boolean;
    onChange?: (e: React.ChangeEvent<HTMLInputElement>) => void;
    style?: React.CSSProperties;
    ref?: React.Ref<HTMLInputElement>;
  }
  const Checkbox: React.ComponentType<CheckboxProps>;
  export default Checkbox;
}

declare module '@/components/admin/Switch' {
  export interface SwitchProps {
    checked?: boolean;
    onChange?: (next: boolean) => void;
    disabled?: boolean;
    label?: React.ReactNode;
    hint?: React.ReactNode;
    id?: string;
    style?: React.CSSProperties;
    ref?: React.Ref<HTMLButtonElement>;
  }
  const Switch: React.ComponentType<SwitchProps>;
  export default Switch;
}

declare module '@/components/admin/Badge' {
  export interface BadgeProps {
    variant?: 'neutral' | 'success' | 'warn' | 'danger' | 'info' | 'ghost';
    size?: 'xs' | 'sm';
    dot?: boolean;
    style?: React.CSSProperties;
    children?: React.ReactNode;
  }
  const Badge: React.ComponentType<BadgeProps>;
  export default Badge;
}

declare module '@/components/admin/EmptyState' {
  export interface EmptyStateProps {
    icon?: React.ReactNode;
    title: React.ReactNode;
    description?: React.ReactNode;
    cta?: React.ReactNode;
    size?: 'sm' | 'md';
    style?: React.CSSProperties;
  }
  const EmptyState: React.ComponentType<EmptyStateProps>;
  export default EmptyState;
}

declare module '@/components/admin/StatCard' {
  export interface StatCardProps {
    label: React.ReactNode;
    value: React.ReactNode;
    delta?: string;
    trend?: 'up' | 'down' | 'flat';
    sparkline?: React.ReactNode;
    footnote?: React.ReactNode;
    style?: React.CSSProperties;
  }
  const StatCard: React.ComponentType<StatCardProps>;
  export default StatCard;
}

declare module '@/components/admin/Spinner' {
  export interface SpinnerProps {
    size?: number;
    color?: string;
    label?: string;
    style?: React.CSSProperties;
  }
  const Spinner: React.ComponentType<SpinnerProps>;
  export default Spinner;
}

declare module '@/components/admin/SkeletonRow' {
  export interface SkeletonBarProps {
    width?: number | string;
    height?: number;
    radius?: number;
    style?: React.CSSProperties;
  }
  export const SkeletonBar: React.ComponentType<SkeletonBarProps>;
  const SkeletonRow: React.ComponentType<{ cols?: number; style?: React.CSSProperties }>;
  export default SkeletonRow;
}

declare module '@/components/admin/Toolbar' {
  export interface ToolbarProps {
    left?: React.ReactNode;
    center?: React.ReactNode;
    right?: React.ReactNode;
    bordered?: boolean;
    style?: React.CSSProperties;
    children?: React.ReactNode;
  }
  const Toolbar: React.ComponentType<ToolbarProps>;
  export default Toolbar;
}

declare module '@/components/admin/Modal' {
  export interface ModalProps {
    open: boolean;
    onClose: () => void;
    title?: React.ReactNode;
    description?: React.ReactNode;
    width?: 'sm' | 'md' | 'lg';
    footer?: React.ReactNode;
    dirty?: boolean;
    dirtyMessage?: string;
    onRequestClose?: () => void;
    style?: React.CSSProperties;
    children?: React.ReactNode;
  }
  const Modal: React.ComponentType<ModalProps>;
  export default Modal;
}

declare module '@/components/admin/Drawer' {
  export interface DrawerProps {
    open: boolean;
    onClose: () => void;
    title?: React.ReactNode;
    description?: React.ReactNode;
    width?: 'sm' | 'md' | 'lg';
    footer?: React.ReactNode;
    dirty?: boolean;
    dirtyMessage?: string;
    onRequestClose?: () => void;
    style?: React.CSSProperties;
    children?: React.ReactNode;
  }
  const Drawer: React.ComponentType<DrawerProps>;
  export default Drawer;
}

declare module '@/components/admin/ConfirmDialog' {
  export interface ConfirmDialogProps {
    open: boolean;
    title: React.ReactNode;
    message?: React.ReactNode;
    confirmLabel?: string;
    cancelLabel?: string;
    variant?: 'danger' | 'warning' | 'primary';
    onConfirm: () => void | Promise<void>;
    onCancel: () => void;
    busy?: boolean;
  }
  const ConfirmDialog: React.ComponentType<ConfirmDialogProps>;
  export default ConfirmDialog;

  export interface ConfirmOptions {
    title: React.ReactNode;
    message?: React.ReactNode;
    confirmLabel?: string;
    cancelLabel?: string;
    variant?: 'danger' | 'warning' | 'primary';
  }
  export function confirm(opts: ConfirmOptions): Promise<boolean>;
  export const ConfirmDialogHost: React.ComponentType<Record<string, never>>;
}

declare module '@/components/admin/Toast' {
  export type ToastVariant = 'neutral' | 'success' | 'warn' | 'danger' | 'info';
  export interface ToastInput {
    id?: string | number;
    message: React.ReactNode;
    variant?: ToastVariant;
    duration?: number;
  }
  export interface ToastApi {
    push: (input: ToastInput | string) => string | number;
    dismiss: (id: string | number) => void;
  }
  export function useToast(): ToastApi;
  export interface ToastProviderProps {
    children?: React.ReactNode;
    position?: 'top' | 'bottom';
  }
  export const ToastProvider: React.ComponentType<ToastProviderProps>;
  const _default: React.ComponentType<ToastProviderProps>;
  export default _default;
}

declare module '@/components/admin/DataTable' {
  export interface Column<T = unknown> {
    key: string;
    header: React.ReactNode;
    render?: (row: T) => React.ReactNode;
    sortKey?: string;
    sortable?: boolean;
    align?: 'left' | 'right' | 'center';
    width?: string | number;
    truncate?: boolean;
  }
  export interface DataTableProps<T = unknown> {
    columns: Array<Column<T>>;
    rows: T[];
    rowKey?: (row: T, i: number) => string | number;
    onRowClick?: (row: T) => void;
    toolbar?: React.ReactNode;
    empty?: React.ReactNode;
    loading?: boolean;
    defaultPageSize?: number;
    paginate?: boolean;
    maxHeight?: number | string;
    density?: 'default' | 'compact';
    style?: React.CSSProperties;
  }
  const DataTable: <T = unknown>(props: DataTableProps<T>) => JSX.Element;
  export default DataTable;
}
