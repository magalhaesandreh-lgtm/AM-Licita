'use client';

import * as React from 'react';
import { Input, type InputProps } from '@/components/ui/input';
import { formatDecimal, parseDecimal } from '@/lib/utils';

interface DecimalInputProps extends Omit<InputProps, 'onChange' | 'value'> {
  value: number | null | undefined;
  onChange: (value: number) => void;
  fractionDigits?: number;
}

const DecimalInput = React.forwardRef<HTMLInputElement, DecimalInputProps>(
  ({ value, onChange, onBlur, fractionDigits = 4, ...props }, ref) => {
    const [displayValue, setDisplayValue] = React.useState(() => formatDecimal(value, fractionDigits));

    React.useEffect(() => {
        setDisplayValue(formatDecimal(value, fractionDigits));
    }, [value, fractionDigits]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setDisplayValue(val);
      const numericValue = parseDecimal(val);
      onChange(numericValue);
    };
    
    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
        const numericValue = parseDecimal(e.target.value);
        setDisplayValue(formatDecimal(numericValue, fractionDigits));
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
      />
    );
  }
);
DecimalInput.displayName = 'DecimalInput';

export { DecimalInput };
