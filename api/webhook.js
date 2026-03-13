const { createClient } = require('@supabase/supabase-js');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Conecta ao Supabase usando as chaves que você já salvou na Vercel
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).send('Método não permitido');

    const sig = req.headers['stripe-signature'];
    let event;

    try {
        const buf = await new Promise((resolve, reject) => {
            let data = '';
            req.on('data', chunk => { data += chunk; });
            req.on('end', () => { resolve(Buffer.from(data)); });
            req.on('error', reject);
        });

        event = stripe.webhooks.constructEvent(buf, sig, process.env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
        return res.status(400).send(`Erro: ${err.message}`);
    }

    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const userId = session.client_reference_id; 

        if (userId) {
            // Isso avisa o seu banco de dados: "Pode liberar o Premium para esse cliente!"
            await supabase
                .from('dados_financeiros') 
                .update({ premium: true })
                .eq('id', userId);
        }
    }

    res.status(200).json({ received: true });
}