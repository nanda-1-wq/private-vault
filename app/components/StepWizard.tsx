import { Check } from 'lucide-react';

interface StepWizardProps {
  steps: string[];
  currentStep: number; // 1-indexed
}

export function StepWizard({ steps, currentStep }: StepWizardProps) {
  return (
    <div className="flex items-start gap-0 w-full">
      {steps.map((label, i) => {
        const stepNum = i + 1;
        const done = stepNum < currentStep;
        const active = stepNum === currentStep;

        return (
          <div key={i} className="flex items-start flex-1">
            <div className="flex flex-col items-center w-full">
              <div className="flex items-center w-full">
                {/* Circle */}
                <div
                  className={[
                    'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 shrink-0 transition-all duration-300',
                    done
                      ? 'bg-cyan-500 border-cyan-500 text-black'
                      : active
                        ? 'border-cyan-400 text-cyan-400 shadow-[0_0_14px_rgba(6,182,212,0.45)]'
                        : 'border-border text-muted-foreground/50',
                  ].join(' ')}
                >
                  {done ? <Check className="h-3.5 w-3.5" /> : stepNum}
                </div>
                {/* Connector line */}
                {i < steps.length - 1 && (
                  <div
                    className={[
                      'flex-1 h-px mt-0 mx-1 transition-colors duration-300',
                      done ? 'bg-cyan-500' : 'bg-border',
                    ].join(' ')}
                  />
                )}
              </div>
              <span
                className={[
                  'text-[11px] mt-1.5 whitespace-nowrap text-left',
                  active
                    ? 'text-cyan-400 font-medium'
                    : done
                      ? 'text-muted-foreground'
                      : 'text-muted-foreground/50',
                ].join(' ')}
              >
                {label}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
