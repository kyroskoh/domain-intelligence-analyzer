import { toast as sonnerToast } from 'sonner';

interface ToastProps {
  title?: string;
  description?: string;
  variant?: 'default' | 'destructive';
}

export function useToast() {
  const toast = ({ title, description, variant = 'default' }: ToastProps) => {
    const message = title && description ? `${title}: ${description}` : title || description || '';
    
    if (variant === 'destructive') {
      sonnerToast.error(message);
    } else {
      sonnerToast.success(message);
    }
  };

  return { toast };
}

export { toast as sonnerToast } from 'sonner';