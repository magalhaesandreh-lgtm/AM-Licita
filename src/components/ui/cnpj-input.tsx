'use client';

import * as React from 'react';
import { Input, type InputProps } from '@/components/ui/input';
import { formatCnpj, parseCnpj } from '@/lib/utils';

interface CnpjInputProps extends Omit<InputProps, 'onChange' | 'value'> {
  value: string | null | undefined;
  onChange: (value: string) => void;
}

const CnpjInput = React.forwardRef<HTMLInputElement, CnpjInputProps>(
  ({ value, onChange, onBlur, ...props }, ref) => {
    const [displayValue, setDisplayValue] = React.useState(() => formatCnpj(value));

    React.useEffect(() => {
        setDisplayValue(formatCnpj(value));
    }, [value]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const rawValue = parseCnpj(e.target.value);
      if(rawValue.length <= 14){
        onChange(rawValue);
        setDisplayValue(formatCnpj(rawValue));
      }
    };

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      const rawValue = parseCnpj(e.target.value);
      setDisplayValue(formatCnpj(rawValue));
      if (onBlur) {
        onBlur(e);
      }
    };

    return (
      <Input
        {...props}
        ref={ref}
        value={displayValue}
        onChange={handleInputChange}
        onBlur={handleBlur}
        maxLength={18} // 00.000.000/0000-00
      />
    );
  }
);
CnpjInput.displayName = 'CnpjInput';

export { CnpjInput };
