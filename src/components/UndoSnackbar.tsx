import { Snackbar, Button } from '@mui/material';
import type { SnackbarCloseReason } from '@mui/material/Snackbar';

interface Props {
  open: boolean;
  onClose: (event: unknown, reason?: SnackbarCloseReason) => void; // <-- change
  onUndo: () => void;
}

export default function UndoSnackbar({ open, onClose, onUndo }: Props) {
  return (
    <Snackbar
      open={open}
      onClose={onClose}
      autoHideDuration={4000}
      message="Task deleted"
      action={<Button color="secondary" size="small" onClick={onUndo}>Undo</Button>}
      anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
    />
  );
}
