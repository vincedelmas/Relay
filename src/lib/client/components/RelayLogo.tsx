import {cn} from "@/lib/utils/classnames";


interface RelayMarkProps {
    className?: string;
}


export function RelayMark({ className }: RelayMarkProps) {
    return (
        <svg
            viewBox="0 0 32 32"
            fill="none"
            aria-hidden="true"
            className={cn("size-5", className)}
        >
            <circle cx="8" cy="16" r="3.25" fill="currentColor"/>
            <circle cx="24" cy="9.5" r="2.75" stroke="currentColor" strokeWidth="2.2"/>
            <circle cx="24" cy="22.5" r="2.75" stroke="currentColor" strokeWidth="2.2"/>
            <path
                d="M11.2 14.7L21.3 10.6M11.2 17.3L21.3 21.4"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
            />
        </svg>
    );
}
