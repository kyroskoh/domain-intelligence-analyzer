import { toast as sonnerToast } from 'sonner';

interface ToastProps {
  title?: string;
  description?: string;
  variant?: 'default' | 'destructive';
}

const toast = ({ title, description, variant = 'default' }: ToastProps) => {
  const message = title && description ? `${title}: ${description}` : title || description || '';
  
  if (variant === 'destructive') {
    sonnerToast.error(message);
  } else {
    sonnerToast.success(message);
  }
};

export function useToast() {
  return { toast };
}

// Export the toast function directly as well
export { toast };
export { toast as sonnerToast } from 'sonner';
